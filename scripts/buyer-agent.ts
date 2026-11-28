import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAddress } from "viem";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { termsMatch, type Terms } from "../lib/terms";
import type { Envelope, Proof } from "../lib/domain";
import { permittedPayments } from "../lib/payment-policy";
const mode = process.argv[2] ?? "broken";
if (!["honest", "broken", "injection"].includes(mode))
  throw Error("Choose honest, broken or injection");
const proof = JSON.parse(
  await fs.readFile("deploy/proof.json", "utf8"),
) as Proof;
const approval = JSON.parse(
  await fs.readFile(".secrets/deposit-approval.json", "utf8"),
) as { approvedUSDCMicro?: number };
if (approval.approvedUSDCMicro !== 3000)
  throw Error(
    "Owner approval required for the maximum 0.003 test USDC demo spend",
  );
const path = `deploy/payments/${mode}.json`;
try {
  await fs.access(path);
  console.log("Existing signed payment artifact retained:", path);
  process.exit(0);
} catch {}
// The frozen promise this endpoint is sold under: the one with a USDC bond on Base.
const bonds = (proof as unknown as { base?: { bonds?: Record<string, { tx?: string }> } }).base?.bonds ?? {};
const endpoint = proof.services?.find(
  (s) => s.status === "FROZEN" && s.endpoint.endsWith("/" + mode) && s.id in bonds,
);
const bonded = bonds[endpoint?.id ?? ""];
if (!endpoint || !bonded?.tx)
  throw Error("A frozen promise with a USDC bond on Base is required (npx tsx scripts/base.ts bond)");
const keys = JSON.parse(
  await fs.readFile(".secrets/accounts.json", "utf8"),
) as string[];
const signer = privateKeyToAccount(
  ("0x" + keys[1].replace(/^0x/, "")) as `0x${string}`,
);
// The terms this buyer agrees to: the frozen promise it read from the registry record.
const agreed: Terms = { service_id: endpoint.id, promise_hash: endpoint.hash };
// Before paying, read the 402 offer and refuse unless the seller sells under exactly those terms.
const offer = await fetch(`${endpoint.endpoint}?city=Lagos`);
const offered = offer.headers.get("payment-required");
if (offer.status !== 402 || !offered)
  throw Error(`Expected an x402 offer, got HTTP ${offer.status}; nothing was paid.`);
const description = decodePaymentRequiredHeader(offered).resource?.description ?? "";
if (!description.includes(`Terms: ${agreed.service_id}, promise ${agreed.promise_hash}`))
  throw Error("The seller does not offer the frozen terms; nothing was paid.");
const intentPath = `.secrets/payment-${mode}-intent.json`;
try {
  await fs.access(intentPath);
  throw Error(
    "A previous payment attempt is unresolved. Reconcile its wallet and facilitator before any retry.",
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const nonce = randomUUID();
await fs.writeFile(
  intentPath,
  JSON.stringify({
    mode,
    nonce,
    buyer: signer.address,
    startedAt: new Date().toISOString(),
  }),
);
const xclient = new x402Client().register(
  "eip155:84532",
  new ExactEvmScheme(signer),
);
xclient.registerPolicy((version, requirements) =>
  permittedPayments(version, requirements, endpoint.seller),
);
const paidFetch = wrapFetchWithPayment(fetch, xclient);
const response = await paidFetch(
  `${endpoint.endpoint}?city=Lagos&nonce=${nonce}`,
);
const body = (await response.json()) as Envelope & { error?: string };
if (!response.ok) throw Error(body.error ?? JSON.stringify(body));
const digest = createHash("sha256")
  .update(body.request + body.response + body.payment_hash)
  .digest("hex");
// The signature must recover the seller registered in the frozen promise, over the agreed terms.
if (
  (await recoverAddress({ hash: `0x${digest}`, signature: body.signature })).toLowerCase() !==
  endpoint.seller.toLowerCase()
)
  throw Error("Seller signature mismatch");
if (!termsMatch(body.request, agreed))
  throw Error("The seller signed different terms than the frozen promise; this evidence cannot be filed.");
await fs.mkdir("deploy/payments", { recursive: true });
await fs.writeFile(
  path,
  JSON.stringify(
    {
      ...body,
      capturedAt: new Date().toISOString(),
      settlementHeader: response.headers.get("payment-response"),
    },
    null,
    2,
  ),
);
await fs.unlink(intentPath);
console.log("x402 settled and seller signature verified:", body.payment_hash);
console.log("Saved byte-exact evidence:", path);
if (process.argv.includes("--file"))
  execFileSync("python", ["scripts/release.py", "file", mode], {
    stdio: "inherit",
  });
