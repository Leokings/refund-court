// RefundEscrow on an in-process chain with a stand-in USDC.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { createPublicClient, createWalletClient, custom, keccak256, toBytes, toFunctionSelector } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const ganache = createRequire(import.meta.url)("ganache");
const M = "test test test test test test test test test test test junk";
const provider = ganache.provider({ logging: { quiet: true }, wallet: { mnemonic: M }, chain: { chainId: 31337, hardfork: "merge" } });
const transport = custom(provider);
const pub = createPublicClient({ chain: hardhat, transport });
const [relayer, seller, buyer, other] = [0, 1, 2, 3].map((i) => createWalletClient({ account: mnemonicToAccount(M, { addressIndex: i }), chain: hardhat, transport }));
const art = (n) => JSON.parse(readFileSync(`evm/artifacts/${n}.json`, "utf8"));
const ESC = art("RefundEscrow");
const USD = art("MockUSDC");
const SERVICE = keccak256(toBytes("registry/service-2"));
const CASE = keccak256(toBytes("court/case-1"));
const GLTX = "0x" + "ab".repeat(32);
let escrow, usdc;

const deploy = async (w, a, args) => (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode, args }) })).contractAddress;
const write = async (w, address, abi, functionName, args = []) => pub.waitForTransactionReceipt({ hash: await w.writeContract({ address, abi, functionName, args }) });
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
const fails = (w, address, abi, functionName, args, name) =>
  assert.rejects(pub.simulateContract({ account: w.account, address, abi, functionName, args }), (e) => {
    const sel = toFunctionSelector(`${name}()`);
    for (let c = e; c; c = c.cause) if (typeof c.data === "string" && c.data.startsWith(sel)) return true;
    return false;
  });
const bal = (who) => read(usdc, USD.abi, "balanceOf", [who.account.address]);
const warp = async (s) => {
  await provider.request({ method: "evm_increaseTime", params: [s] });
  await provider.request({ method: "evm_mine", params: [] });
};

before(async () => {
  usdc = await deploy(relayer, USD, []);
  escrow = await deploy(relayer, ESC, [usdc, relayer.account.address]);
  await write(relayer, usdc, USD.abi, "mint", [seller.account.address, 10_000n]);
  await write(seller, usdc, USD.abi, "approve", [escrow, 10_000n]);
});

test("a seller posts a bond and owns it", async () => {
  await write(seller, escrow, ESC.abi, "postBond", [SERVICE, 3000n]);
  const [owner, balance] = await read(escrow, ESC.abi, "bonds", [SERVICE]);
  assert.equal(owner, seller.account.address);
  assert.equal(balance, 3000n);
  await write(relayer, usdc, USD.abi, "mint", [other.account.address, 100n]);
  await write(other, usdc, USD.abi, "approve", [escrow, 100n]);
  await fails(other, escrow, ESC.abi, "postBond", [SERVICE, 100n], "OnlySeller");
  await fails(seller, escrow, ESC.abi, "postBond", [SERVICE, 0n], "ZeroAmount");
});

test("the relayer pays a buyer back once, and the event names the GenLayer judgment", async () => {
  const receipt = await write(relayer, escrow, ESC.abi, "refund", [CASE, SERVICE, buyer.account.address, 1000n, GLTX]);
  assert.equal(await bal(buyer), 1000n);
  assert.equal((await read(escrow, ESC.abi, "bonds", [SERVICE]))[1], 2000n);
  assert.equal(await read(escrow, ESC.abi, "refunded", [CASE]), true);
  const topic = keccak256(toBytes("Refunded(bytes32,bytes32,address,uint256,bytes32)"));
  const log = receipt.logs.find((l) => l.topics[0] === topic);
  assert.ok(log, "Refunded emitted");
  assert.equal(log.topics[1], CASE);
  assert.equal(("0x" + log.topics[3].slice(26)).toLowerCase(), buyer.account.address.toLowerCase());
  assert.equal(BigInt("0x" + log.data.slice(2, 66)), 1000n);
  assert.equal("0x" + log.data.slice(66, 130), GLTX);
  await fails(relayer, escrow, ESC.abi, "refund", [CASE, SERVICE, buyer.account.address, 1000n, GLTX], "AlreadyRefunded");
});

test("only the relayer refunds, and never beyond the bond", async () => {
  const other = keccak256(toBytes("court/case-2"));
  await fails(buyer, escrow, ESC.abi, "refund", [other, SERVICE, buyer.account.address, 1000n, GLTX], "OnlyRelayer");
  await fails(relayer, escrow, ESC.abi, "refund", [other, SERVICE, buyer.account.address, 5000n, GLTX], "BondTooSmall");
  await fails(relayer, escrow, ESC.abi, "refund", [other, keccak256(toBytes("no-bond")), buyer.account.address, 1n, GLTX], "BondTooSmall");
});

test("a seller withdraws only after a day, and refunds stay payable meanwhile", async () => {
  await fails(seller, escrow, ESC.abi, "withdraw", [SERVICE], "NotUnlocked");
  await fails(buyer, escrow, ESC.abi, "requestWithdrawal", [SERVICE], "OnlySeller");
  await write(seller, escrow, ESC.abi, "requestWithdrawal", [SERVICE]);
  await fails(seller, escrow, ESC.abi, "withdraw", [SERVICE], "NotUnlocked");
  await write(relayer, escrow, ESC.abi, "refund", [keccak256(toBytes("court/case-3")), SERVICE, buyer.account.address, 1000n, GLTX]);
  await warp(86401);
  const before = await bal(seller);
  await write(seller, escrow, ESC.abi, "withdraw", [SERVICE]);
  assert.equal((await bal(seller)) - before, 1000n);
  assert.equal((await read(escrow, ESC.abi, "bonds", [SERVICE]))[1], 0n);
});

test("the court address is set once, by the relayer", async () => {
  await fails(seller, escrow, ESC.abi, "setCourt", ["0xabc"], "OnlyRelayer");
  await write(relayer, escrow, ESC.abi, "setCourt", ["0xabc"]);
  assert.equal(await read(escrow, ESC.abi, "court"), "0xabc");
  await fails(relayer, escrow, ESC.abi, "setCourt", ["0xdef"], "CourtAlreadySet");
});
