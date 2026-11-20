/**
 * Creates the relayer wallet (.secrets/relayer.json) and tops up Base Sepolia ETH for gas, from a
 * funding key given by environment variable (never printed):
 *
 *   npx tsx --env-file=<file with GAS_FUNDER_KEY> scripts/fund-gas.ts
 *
 * Also moves test USDC from the seller to the buyer so the buyer can pay for three calls.
 */
import fs from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org", { retryCount: 6 }) });
const keyOf = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as Hex;
const wallet = (k: Hex) => createWalletClient({ account: privateKeyToAccount(k), chain: baseSepolia, transport: http("https://sepolia.base.org", { retryCount: 6 }) });

if (!fs.existsSync(".secrets/relayer.json")) fs.writeFileSync(".secrets/relayer.json", JSON.stringify({ key: generatePrivateKey() }));
const relayer = privateKeyToAccount(keyOf(JSON.parse(fs.readFileSync(".secrets/relayer.json", "utf8")).key));
const [sellerKey, buyerKey] = (JSON.parse(fs.readFileSync(".secrets/accounts.json", "utf8")) as string[]).map(keyOf);
const seller = privateKeyToAccount(sellerKey);
const buyer = privateKeyToAccount(buyerKey);

const funderKey = process.env.GAS_FUNDER_KEY ?? process.env.AGENTSCORE_SIGNER_KEY;
const targets: [string, Hex, bigint][] = [
  ["relayer", relayer.address, parseEther("0.0002")],
  ["seller", seller.address, parseEther("0.0001")],
];
for (const [name, address, want] of targets) {
  const have = await pub.getBalance({ address });
  if (have >= want / 2n) {
    console.log(name, address, "has", formatEther(have), "ETH");
    continue;
  }
  if (!funderKey) throw Error("Set GAS_FUNDER_KEY to a Base Sepolia key with a little ETH.");
  const hash = await wallet(keyOf(funderKey)).sendTransaction({ to: address, value: want - have });
  await pub.waitForTransactionReceipt({ hash });
  console.log(name, address, "topped up to", formatEther(await pub.getBalance({ address })), "ETH");
}

// The buyer needs 0.003 USDC for three paid calls; the seller keeps the rest for bonds.
const buyerUsdc = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
if (buyerUsdc < 3000n) {
  const sellerUsdc = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [seller.address] });
  if (sellerUsdc < 3000n - buyerUsdc + 8000n) throw Error(`Seller ${seller.address} needs test USDC from faucet.circle.com (Base Sepolia).`);
  const hash = await wallet(sellerKey).writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [buyer.address, 3000n - buyerUsdc] });
  await pub.waitForTransactionReceipt({ hash });
  console.log("buyer", buyer.address, "received", Number(3000n - buyerUsdc) / 1e6, "USDC");
} else console.log("buyer", buyer.address, "has", Number(buyerUsdc) / 1e6, "USDC");
