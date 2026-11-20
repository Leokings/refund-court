/**
 * The Base Sepolia side of Refund Court: the USDC escrow, seller bonds and refunds.
 * State lives in deploy/proof.json under `base`. Every step is resumable.
 *
 *   npx tsx scripts/base.ts deploy            # RefundEscrow(usdc, relayer)
 *   npx tsx scripts/base.ts set-court         # record the GenLayer court on the escrow (once)
 *   npx tsx scripts/base.ts bond              # each frozen promise: seller posts its USDC bond
 *   npx tsx scripts/base.ts refund <case-id>  # pay a finalized REFUND case back to its buyer
 *   npx tsx scripts/base.ts balances          # USDC and ETH of the demo wallets
 *
 * Keys come from ignored .secrets/: accounts.json (seller, buyer) and relayer.json. Never printed.
 */
import fs from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const PROOF = "deploy/proof.json";
const BOND_UNITS = 2000n; // covers two full refunds of a 0.001 USDC call
const CONFIRMATIONS = 3;

const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) });
const keyOf = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as Hex;
const accounts = () => (JSON.parse(fs.readFileSync(".secrets/accounts.json", "utf8")) as string[]).map((k) => privateKeyToAccount(keyOf(k)));
const relayerKey = () => {
  const path = ".secrets/relayer.json";
  if (!fs.existsSync(path)) throw Error("Missing .secrets/relayer.json (run scripts/fund-gas.ts first).");
  return keyOf(JSON.parse(fs.readFileSync(path, "utf8")).key);
};
const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain: baseSepolia, transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) });
const load = () => JSON.parse(fs.readFileSync(PROOF, "utf8"));
const save = (p: unknown) => fs.writeFileSync(PROOF, JSON.stringify(p, null, 2));
const art = () => JSON.parse(fs.readFileSync("evm/artifacts/RefundEscrow.json", "utf8")) as { abi: any[]; bytecode: Hex; compiler: string };
const scan = (tx: string) => `https://sepolia.basescan.org/tx/${tx}`;

/** The key RefundEscrow keeps a promise's bond under. */
export const serviceKey = (registry: string, serviceId: string) => keccak256(toBytes(`${registry.toLowerCase()}/${serviceId}`));

async function confirmed(hash: Hex) {
  const receipt = await pub.waitForTransactionReceipt({ hash, confirmations: CONFIRMATIONS, timeout: 300_000 });
  if (receipt.status !== "success") throw Error(`Base transaction reverted: ${scan(hash)}`);
  return receipt;
}

async function deploy() {
  const p = load();
  p.base ??= { chainId: 84532, usdc: USDC };
  if (p.base.escrow?.address) return console.log("escrow already deployed", p.base.escrow.address);
  const relayer = wallet(relayerKey());
  const a = art();
  const hash = await relayer.deployContract({ abi: a.abi, bytecode: a.bytecode, args: [USDC, relayer.account.address] });
  p.base.escrow = { deployTx: hash, relayer: relayer.account.address.toLowerCase(), source: "evm/RefundEscrow.sol", compiler: a.compiler };
  save(p);
  const receipt = await confirmed(hash);
  p.base.escrow.address = receipt.contractAddress!.toLowerCase();
  save(p);
  console.log("RefundEscrow", p.base.escrow.address, scan(hash));
}

async function setCourt() {
  const p = load();
  const court = p.contracts?.RefundCourt?.address;
  if (!court) throw Error("Deploy the GenLayer RefundCourt first.");
  const a = art();
  const current = (await pub.readContract({ address: p.base.escrow.address, abi: a.abi, functionName: "court" })) as string;
  if (current) return console.log("court already set", current);
  const hash = await wallet(relayerKey()).writeContract({ address: p.base.escrow.address, abi: a.abi, functionName: "setCourt", args: [court] });
  await confirmed(hash);
  p.base.escrow.setCourtTx = hash;
  save(p);
  console.log("escrow court set to", court, scan(hash));
}

async function bond() {
  const p = load();
  const registry = p.contracts?.ServicePromise?.address;
  const escrow = p.base?.escrow?.address;
  if (!registry || !escrow) throw Error("Deploy the escrow and the GenLayer contracts first.");
  const [sellerAccount] = accounts();
  const seller = wallet(keyOf(JSON.parse(fs.readFileSync(".secrets/accounts.json", "utf8"))[0]));
  p.base.bonds ??= {};
  const frozen = (p.services ?? []).filter((s: any) => s.status === "FROZEN");
  if (!frozen.length) throw Error("No frozen promises recorded yet (run python scripts/release.py record).");
  const need = BOND_UNITS * BigInt(frozen.filter((s: any) => !p.base.bonds[s.id]?.tx).length);
  const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [sellerAccount.address, escrow] });
  if (need > 0n && allowance < need) {
    const hash = await seller.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [escrow, need] });
    await confirmed(hash);
    p.base.approveTx = hash;
    save(p);
  }
  const a = art();
  for (const s of frozen) {
    if (p.base.bonds[s.id]?.tx) continue;
    const key = serviceKey(registry, s.id);
    const hash = await seller.writeContract({ address: escrow, abi: a.abi, functionName: "postBond", args: [key, BOND_UNITS] });
    p.base.bonds[s.id] = { tx: hash, serviceKey: key, amountUnits: BOND_UNITS.toString(), seller: sellerAccount.address.toLowerCase() };
    save(p);
    await confirmed(hash);
    console.log("bond", s.id, formatUnits(BOND_UNITS, 6), "USDC", scan(hash));
  }
}

async function refund(cid: string) {
  const p = load();
  const c = (p.claimCases ?? []).find((x: any) => x.id === cid);
  if (!c) throw Error(`Unknown case ${cid}; run python scripts/release.py record`);
  if (c.status !== "REFUND") throw Error(`${cid} is ${c.status}; only a finalized REFUND is paid`);
  p.base.payouts ??= {};
  if (p.base.payouts[cid]?.tx) return console.log("already refunded", scan(p.base.payouts[cid].tx));
  const judgeTx = p.transactions?.[`judge-${p.caseModes?.[cid]}`];
  if (!judgeTx) throw Error(`No recorded GenLayer judgment for ${cid}`);
  const a = art();
  const key = p.base.bonds[c.service_id]?.serviceKey;
  if (!key) throw Error(`No bond recorded for ${c.service_id}`);
  const hash = await wallet(relayerKey()).writeContract({ address: p.base.escrow.address, abi: a.abi, functionName: "refund", args: [c.case_key, key, c.buyer, BigInt(c.refund_units), judgeTx] });
  p.base.payouts[cid] = { tx: hash, buyer: c.buyer, amountUnits: c.refund_units, genlayerJudgeTx: judgeTx };
  save(p);
  await confirmed(hash);
  console.log("refunded", cid, formatUnits(BigInt(c.refund_units), 6), "USDC to", c.buyer, scan(hash));
}

async function balances() {
  const [seller, buyer] = accounts();
  const who = [["seller", seller.address], ["buyer", buyer.address]] as [string, Hex][];
  if (fs.existsSync(".secrets/relayer.json")) who.push(["relayer", privateKeyToAccount(relayerKey()).address]);
  const p = fs.existsSync(PROOF) ? load() : {};
  if (p.base?.escrow?.address) who.push(["escrow", p.base.escrow.address]);
  for (const [name, address] of who) {
    const [usdc, eth] = await Promise.all([pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }), pub.getBalance({ address })]);
    console.log(name.padEnd(8), address, formatUnits(usdc, 6).padStart(10), "USDC", formatUnits(eth, 18).slice(0, 10), "ETH");
  }
}

const [stage, arg] = process.argv.slice(2);
const run = { deploy, "set-court": setCourt, bond, refund: () => refund(arg), balances }[stage as string];
if (!run) {
  console.error("usage: base.ts deploy|set-court|bond|refund <case-id>|balances");
  process.exitCode = 2;
} else await run();
