// Drafts the Portal fields from deploy/proof.json. Never submits anything.
import fs from "node:fs/promises";
import { explorer, basePayment } from "../lib/explorer";
import type { Proof } from "../lib/domain";

const p = JSON.parse(await fs.readFile("deploy/proof.json", "utf8")) as Proof;
let verified = false;
try {
  verified =
    JSON.parse(await fs.readFile("deploy/proof-verification.json", "utf8"))
      .passed === true;
} catch {}
const basescan = (a: string) => `https://sepolia.basescan.org/address/${a}`;
const refunds = Object.entries(p.base?.payouts ?? {});

const evidence = [
  ...Object.entries(p.contracts).map(([name, c]) => ({
    type: "GenLayer Explorer Contract",
    title: `${name} · StudioNet 61999`,
    url: explorer("address", c.address),
  })),
  ...(p.base?.escrow?.address
    ? [
        {
          type: "Contract",
          title: "RefundEscrow (USDC bonds and refunds) · Base Sepolia",
          url: basescan(p.base.escrow.address!),
        },
      ]
    : []),
  ...refunds.map(([cid, r]) => ({
    type: "Transaction",
    title: `USDC refund for ${cid} · Base Sepolia`,
    url: basePayment(r.tx),
  })),
  ...(p.website
    ? [{ type: "Live Demo", title: "Refund Court", url: p.website }]
    : []),
  ...(p.github
    ? [{ type: "GitHub Repository", title: "Source, skill and proof", url: p.github }]
    : []),
];

const fields = {
  category: "Projects",
  mission: "Internet Court: Partner Demo Lab",
  partner: "x402",
  name: "Refund Court",
  oneLiner:
    "Chargebacks for agents: pay an API with x402, and if the response breaks the seller's promise, GenLayer judges it and the USDC comes back.",
  description:
    "Agents pay APIs with x402 but have no recourse when the response is wrong. Refund Court adds it. A seller's plain-English promise is compiled by GenLayer validators into 2–4 checkable criteria (vague promises are refused) and backed by a USDC bond on Base Sepolia. The buyer pays 0.001 USDC through x402 and gets live weather plus the exact request and response signed by the seller. Filing it, code checks the signature, the 24-hour window and replay; validators confirm the payment on Base and rule on each criterion with a verbatim quote. A NOT_MET verdict refunds the full 0.001 USDC from the bond, and validators verify that refund on Base before the case closes. Instructions hidden in a response are ignored.",
  outcome: verified
    ? "Six live cases: a vague promise refused; three promises frozen and bonded in USDC; a stale Fahrenheit response refunded in USDC on Base; an honest live-weather response delivered with no refund; a response telling the judge to mark everything met still refunded; replay and forgery rejected by code."
    : "In progress: contracts deployed; live payment, judgment and refund evidence not yet complete and verified.",
  howTo:
    "Open the site (no wallet needed) to read each live case: the signed response, every criterion's verdict and quote, and links to the x402 payment, the GenLayer judgment and the USDC refund on Base. Agents follow skills/refund-court/SKILL.md; npm run verify:proof re-checks every claim on both chains.",
  contracts: evidence.filter((e) => e.type === "GenLayer Explorer Contract"),
  evidence,
  status: verified ? "DRAFT_VERIFIED_NOT_SUBMITTED" : "DRAFT_INCOMPLETE_NOT_SUBMITTED",
  website: p.website ?? "",
  repository: p.github ?? "",
  submitted: false,
};
for (const [name, limit] of [
  ["oneLiner", 180],
  ["description", 1000],
  ["outcome", 500],
] as const) {
  if (fields[name].length > limit) throw Error(name + " exceeds " + limit);
}
await fs.mkdir("docs/submission", { recursive: true });
await fs.writeFile("docs/submission/portal-fields.json", JSON.stringify(fields, null, 2));
console.log("Portal draft prepared; nothing submitted.", {
  verified,
  oneLiner: fields.oneLiner.length,
  description: fields.description.length,
  outcome: fields.outcome.length,
  evidence: evidence.length,
});
