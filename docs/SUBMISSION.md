# Portal submission

Mission: **Internet Court: Partner Demo Lab** · Type: Projects · Partner: **x402**

| Field | Value |
|---|---|
| Project name | Refund Court |
| Primary tag | Dispute Resolution (Escrow Claims, Evidence Assessment) |
| Website | https://refund-court-x402.vercel.app |
| GitHub | https://github.com/Leokings/refund-court |
| Contract links | https://explorer-studio.genlayer.com/address/0xCC1e2489587bBb829dd574F83e8bF05B81ec863e · https://explorer-studio.genlayer.com/address/0xDf6f042fe964928E2E0fF58a495Da5B2C5651dEf |
| Demo URL (YouTube or X) | https://x.com/plain3rd/status/2124914831660888550 |

## Reply to "More information requested" (883 characters)

Fixed and redeployed live (v2.1, commit 4ec3342). Retry: a payment check that is pending (unmined or under 3 confirmations) or hits a Base RPC outage is no longer a verdict. judge_claim keeps the case FILED, keeps its payment reserved so replay is still rejected, logs the attempt (bounded), and can be called again; only a definitively wrong payment voids. Operator: release.py judge <mode>. Terms: the seller signs service_id and promise_hash into every request; the API sells only under its bonded frozen promise and names it in the 402 offer; the buyer agent checks before and after paying; file_claim rejects any other key or hash. Live: case-1's real evidence filed under another frozen promise of the same seller and endpoint was rejected. Tests: unmined, unconfirmed and RPC-down claims recover on retry; other key, stale hash and edited terms rejected. verify:proof 122/122.

## One-liner (147/180)

Chargebacks for agents: an agent pays an API with x402; if the signed response breaks the seller's promise, GenLayer rules and the USDC comes back.

## Description (912/1000)

Agents pay APIs with x402 but get no recourse when the answer is wrong. Refund Court adds a chargeback. GenLayer validators compile a seller's plain-English promise into 2–4 checkable criteria (vague ones are refused); the seller backs it with a USDC bond on Base. The buyer pays 0.001 USDC with x402 and gets live weather plus the exact request, response and agreed terms (service id, promise hash) signed by the seller. Filing checks the signature, those terms, replay and a 24 h window. Validators confirm the payment on Base (not yet confirmed: the claim stays filed for retry) and rule on each criterion with a verbatim quote. Any NOT_MET refunds 0.001 USDC from the bond once the verdict is final, and validators verify that refund. Live: stale Fahrenheit refunded; honest delivered; a judge-injection refunded anyway; replay, forgery and other-terms filing blocked. Limits: test networks; one relayer key.

## How-to

1. **See the cases.** Open https://refund-court-x402.vercel.app (no wallet needed). Open "Broken promise": the seller-signed response, the terms it was sold under, each criterion's verdict and quote, and links to the x402 payment, filing, judgment, USDC refund and refund check.
2. **See the judgment.** https://explorer-studio.genlayer.com/tx/0x21d9eced43a2d7267cbba224eed064ce906ee6ff887d69d5135ad11a4a9313c5: FINALIZED. The broken case reads REFUND: Celsius and freshness are NOT_MET, each with a quote from the signed response.
3. **See the refund on Base.** https://sepolia.basescan.org/tx/0xc0c9b40c0e3957e0b539aa253ee94c43d808a1ddfb2ff4d59b082543d4065a4f: 0.001 USDC from the RefundEscrow to the buyer; the Refunded event names the GenLayer judgment.
4. **See evidence bound to its terms.** https://explorer-studio.genlayer.com/tx/0x3390094a48f85269c903e08b6fdb5edf7ee96fd8132cd1e59541ce96fd8117f4: the same signed evidence filed under another frozen promise of the same seller and endpoint is rejected ("signed terms do not match").
5. **Re-check everything.** Clone https://github.com/Leokings/refund-court, run npm ci and pip install -r requirements.txt, then npm run verify:proof (122 checks on GenLayer and Base). Tests: npm run test:contract (incl. retry after unconfirmed payment or RPC outage), npm run test:evm, npm test.

## Expected verification outcome (409/500)

All 122 checks of npm run verify:proof pass on both chains. The site shows case-1 and case-3 REFUNDED with NOT_MET verdicts quoting the signed response, and case-2 DELIVERED, each sold under its signed service id and promise hash. Judgments are FINALIZED; each refund moves 0.001 USDC escrow→buyer and is recorded only after validators read it. Replay, forgery and other-terms filings end in execution errors.

## Evidence

- Repository: https://github.com/Leokings/refund-court
- RefundCourt contract at the deployed commit: https://github.com/Leokings/refund-court/blob/4ec33424ed8e56f09d1e1872659f3cbbd0742b56/contracts/refund_court.py
- ServicePromise contract at the deployed commit: https://github.com/Leokings/refund-court/blob/4ec33424ed8e56f09d1e1872659f3cbbd0742b56/contracts/service_promise.py
- RefundEscrow (Base) at the deployed commit: https://github.com/Leokings/refund-court/blob/4ec33424ed8e56f09d1e1872659f3cbbd0742b56/evm/RefundEscrow.sol
- Release manifest: every transaction on both chains: https://github.com/Leokings/refund-court/blob/4ec33424ed8e56f09d1e1872659f3cbbd0742b56/deploy/proof.json
- Retry and terms tests: https://github.com/Leokings/refund-court/blob/4ec33424ed8e56f09d1e1872659f3cbbd0742b56/tests/direct/test_court.py
- RefundCourt on the GenLayer explorer: https://explorer-studio.genlayer.com/address/0xCC1e2489587bBb829dd574F83e8bF05B81ec863e
- ServicePromise on the GenLayer explorer: https://explorer-studio.genlayer.com/address/0xDf6f042fe964928E2E0fF58a495Da5B2C5651dEf
- RefundEscrow on Base Sepolia: https://sepolia.basescan.org/address/0x5c188ace77d2334091fd13e634bc1276f8d25d2d
- Vague promise refused at compile time: https://explorer-studio.genlayer.com/tx/0x62a567894df8f3a1c36bd096d075242b50ffbd440d68ad2c1206766dd5f46a7d
- Judgment: stale Fahrenheit response, REFUND: https://explorer-studio.genlayer.com/tx/0x21d9eced43a2d7267cbba224eed064ce906ee6ff887d69d5135ad11a4a9313c5
- Judgment: honest response, DELIVERED: https://explorer-studio.genlayer.com/tx/0x3a36c2b80100b2237c117d2d227021cc8c3627603eeaf06b547452ae79e32c66
- Judgment: response that tells the judge to pass it, REFUND: https://explorer-studio.genlayer.com/tx/0xdf7c383cada5e3db7badd5c9db2a28efe15c564831d811e020928bfc5e3f17a0
- x402 payment on Base (broken case): https://sepolia.basescan.org/tx/0xed5d561a2feb95124d8439c4122e0149356f6c6c4cf7be92f1a46b7c16a21710
- USDC refund on Base (broken case): https://sepolia.basescan.org/tx/0xc0c9b40c0e3957e0b539aa253ee94c43d808a1ddfb2ff4d59b082543d4065a4f
- USDC refund on Base (injection case): https://sepolia.basescan.org/tx/0x0f1e8ef92406f992563d7442960919b8666bb5fa15929165963b7eac84322089
- Validators verify the refund on Base: https://explorer-studio.genlayer.com/tx/0xda2fc60b06ad561321a7693e5aa85d2e0d5b90e8c5b5c5a14f22f50811263ea0
- Expected failure: evidence filed under other frozen terms: https://explorer-studio.genlayer.com/tx/0x3390094a48f85269c903e08b6fdb5edf7ee96fd8132cd1e59541ce96fd8117f4
- Expected failure: replayed payment: https://explorer-studio.genlayer.com/tx/0x00dc6caae562db96929477db23c0bc9ebc57dd527b55c3971b7bc9ee9beefb77
- Expected failure: forged signature: https://explorer-studio.genlayer.com/tx/0x395c79a90d280caf0b2edc74b32f1c9c28e0520eefa963b470ab509ccefa00c4
- 45-second video: https://refund-court-x402.vercel.app/video/refund-court.mp4
