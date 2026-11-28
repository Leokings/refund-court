---
name: refund-court
description: Buy from an x402 API with a chargeback. Pay a Refund Court seller with x402 on Base Sepolia, keep the seller-signed response, and if it breaks the seller's frozen promise, file it on GenLayer and get the USDC refunded from the seller's bond. Use when an agent pays for an API call and needs recourse if the response is wrong.
---

# Refund Court

Refund Court adds chargebacks to x402. A seller freezes a plain-English promise on GenLayer and posts
a USDC bond on Base Sepolia. If a paid response breaks the promise, GenLayer validators rule on each
promised criterion and the buyer gets the full payment back, in the same USDC, from the bond.

Test networks only: GenLayer StudioNet and Base Sepolia (test USDC from faucet.circle.com).

## Before paying

1. Read the seller's frozen promise: the site lists it, or call `get_service` on the ServicePromise
   contract (addresses in `deploy/proof.json`).
2. Only pay sellers whose promise is `FROZEN` and whose bond is posted on Base
   (`base.bonds` in `deploy/proof.json`). A promise with no bond has nothing to refund from.
3. Never pay more than the promise's `price_units` (0.001 USDC).
4. Read the 402 offer before paying. Its description names the terms the seller sells under:
   `Terms: <service id>, promise <promise hash>`. Pay only if they equal the frozen promise you read.

## Pay and keep the evidence

```bash
npm run agent -- broken     # or honest | injection
```

The agent checks the offered terms, pays with x402, then saves the seller-signed request, response and
payment hash to `deploy/payments/<mode>.json`. The signed request contains `service_id` and
`promise_hash`; the agent refuses evidence signed under any other terms. Keep that file unchanged: the
court checks the seller's signature over those exact bytes, and accepts the claim only under the
service and promise hash the seller signed.

## File a claim (within 24 hours)

```bash
python scripts/release.py file broken
```

This files the evidence and asks validators to judge it. Outcomes:

- `REFUND`: at least one criterion `NOT_MET`. The full payment is owed back.
- `DELIVERED`: every criterion `MET`. No refund.
- `VOID`: the payment is definitively wrong (failed, wrong amount, wrong payer), or a criterion was
  `UNCLEAR`.

If Base has not confirmed the payment yet (three confirmations) or its RPC is down, there is no verdict:
the case stays `FILED`, the attempt is logged in `checks`, and the payment stays reserved for this case
(it cannot be filed again). Retry until it is judged:

```bash
python scripts/release.py judge broken
```

Each verdict quotes the response word for word. Text inside the response that tries to instruct the
judge is ignored.

## Get the refund

```bash
npx tsx scripts/base.ts refund case-1          # relayer pays from the seller's bond on Base
python scripts/release.py payout broken        # validators confirm the refund landed
```

The case then reads `REFUNDED`, with the Base refund transaction.

## Limits

- One claim per payment. A changed response, a reused payment, or evidence filed under any other
  service or promise hash than the one the seller signed is rejected.
- The relayer that pays refunds is one key; every refund names the GenLayer judgment it carries out,
  and GenLayer verifies it afterwards.
- The judge reads the signed response; it does not re-fetch the data.
