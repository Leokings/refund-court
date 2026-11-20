#!/usr/bin/env node
// Compiles the Base contracts with solc-js; writes ABI + bytecode to evm/artifacts/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const solc = createRequire(import.meta.url)("solc");
const sources = { "RefundEscrow.sol": "evm/RefundEscrow.sol", "MockUSDC.sol": "evm/test/MockUSDC.sol" };
const input = {
  language: "Solidity",
  sources: Object.fromEntries(Object.entries(sources).map(([n, p]) => [n, { content: readFileSync(p, "utf8") }])),
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of out.errors ?? []) console.error(e.formattedMessage);
if ((out.errors ?? []).some((e) => e.severity === "error")) process.exit(1);
mkdirSync("evm/artifacts", { recursive: true });
for (const [file, contracts] of Object.entries(out.contracts))
  for (const [name, c] of Object.entries(contracts)) {
    if (name.startsWith("I")) continue;
    writeFileSync(`evm/artifacts/${name}.json`, JSON.stringify({ contractName: name, source: sources[file], compiler: solc.version(), abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2) + "\n");
    console.log(`${name}: ${c.evm.bytecode.object.length / 2} bytes`);
  }
