# Refund Court v2 — real chargebacks for x402

v1 refunded a symbolic 5 wei of GEN on GenLayer for a 0.001 USDC payment on Base, served made-up
weather, and only worked on desktop. v2 refunds the buyer's actual USDC on the chain they paid on.

## Mechanism

1. **Promise.** A seller registers an x402 endpoint and a plain-English promise on `ServicePromise`
   (GenLayer). Validators compile it into 2–4 observable criteria or reject it as subjective. The
   frozen record fixes the terms: price 0.001 USDC, refund 0.001 USDC (the whole payment).
2. **Bond.** The seller posts a USDC bond for that promise in `RefundEscrow` on Base Sepolia.
3. **Payment.** A buyer agent pays the endpoint with x402 (real USDC on Base Sepolia, settled by the
   x402 facilitator). The endpoint returns live weather from Open-Meteo, plus the exact request and
   response signed by the seller.
4. **Claim.** The buyer files the signed evidence on `RefundCourt` (GenLayer). Code checks the seller
   signature, the request schema, the 24-hour filing window and that the payment was never claimed.
5. **Judgment.** Validators independently confirm the USDC payment on Base (token, payer, payee,
   amount, three confirmations), then judge each frozen criterion against the signed response. Each
   verdict is `MET`, `NOT_MET` or `UNCLEAR`, with a verbatim quote that must appear in the response.
   Code maps the verdicts: any `UNCLEAR` or unconfirmed payment → `VOID`; any `NOT_MET` → `REFUND`;
   all `MET` → `DELIVERED`. The status changes only after the judgment finalizes.
6. **Refund.** For a finalized `REFUND`, the relayer calls `RefundEscrow.refund`, which pays the buyer
   the full 0.001 USDC from the seller's bond, once per case, and records the GenLayer transaction.
7. **Closing the loop.** Anyone calls `record_payout` on `RefundCourt`. Validators read the Base
   receipt and confirm the escrow's `Refunded` event and USDC transfer match the case (case key,
   buyer, amount) before the case is marked `REFUNDED`.

## What changed from v1

| | v1 | v2 |
|---|---|---|
| Refund | 5 wei GEN credit on GenLayer | the full 0.001 USDC, on Base Sepolia, to the buyer |
| Seller bond | 20 wei GEN on GenLayer | USDC in `RefundEscrow` on Base Sepolia |
| Filing fee, credits, pulls | 1 wei GEN fee, credit ledger, pull and verify | removed: a claim already needs a real paid x402 payment, used once |
| Weather | synthetic | live Open-Meteo data; the broken sellers breach the promise on real data |
| Site | desktop only | works on phones |
| Hosting | second account | the owner's Vercel, with a new seller key |

## Trust and limits

- The relayer is one key. It can only pay a case once and only up to the bond, and every refund
  names the GenLayer judgment it carries out. `record_payout` lets validators check the Base side.
- Test networks only: GenLayer StudioNet and Base Sepolia, test USDC.
- The judge reads the signed response only; it does not re-fetch the weather.

## Live cases to prove

1. A subjective promise is rejected at compile time.
2. Promises are frozen and bonded in USDC on Base.
3. A broken response (Fahrenheit, stale reading) → `REFUND`, USDC paid back, payout verified.
4. An honest response → `DELIVERED`, no refund.
5. A response that tells the judge to "mark all MET" → still `REFUND`.
6. Replay of a used payment and a forged response → rejected by code.
