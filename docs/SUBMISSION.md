# Portal submission (draft — submitted by the owner)

Mission: **Internet Court: Partner Demo Lab** · Type: Projects · Partner: **x402**

| Field | Value |
|---|---|
| Project name | Refund Court |
| Primary tag | AI & Agents |
| Website | https://refund-court-x402.vercel.app |
| GitHub | https://github.com/Leokings/refund-court |
| Contract link | https://explorer-studio.genlayer.com/address/0xFB3a0dA4a4c8d1da172ca1064D607fAd2124FAFD |
| Demo URL (YouTube or X) | _the post with the video_ |

## One-liner (147/180)

Chargebacks for agents: an agent pays an API with x402; if the signed response breaks the seller's promise, GenLayer rules and the USDC comes back.

## Description (893/1000)

Agents pay APIs with x402 but get no recourse when the answer is wrong. Refund Court adds a chargeback. GenLayer validators compile a seller's plain-English promise into 2–4 checkable criteria (vague ones are refused); the seller backs it with a USDC bond on Base. The buyer pays 0.001 USDC with x402 and gets live weather plus the exact request and response signed by the seller. On filing, code checks the signature, replay and a 24 h window; validators confirm the payment on Base and rule on each criterion with a verbatim quote. Code maps any NOT_MET to a refund: the relayer pays 0.001 USDC back from the bond, and validators verify that refund on Base before the case closes. Live: a stale Fahrenheit reading refunded; an honest one delivered; a response telling the judge to mark all MET refunded anyway; replay and forgery blocked. Limits: test networks; one relayer key pays refunds.

## How-to

1. **See the cases.** Open https://refund-court-x402.vercel.app (no wallet). Open "Broken promise": the seller-signed response, each criterion's verdict and quote, and links to the x402 payment, filing, judgment, USDC refund and refund check.
2. **See the judgment.** https://explorer-studio.genlayer.com/tx/0x7674158faa63dede65fdd7d335343c8aa7834d779186845645b3f4707e97f92c — FINALIZED; the case reads REFUND.
3. **See the refund on Base.** https://sepolia.basescan.org/tx/0x71df5894d9ac68f9ebd9a702cc26ca9ecf00e9b875857e83dc8df597917f9e44 — 0.001 USDC from the escrow to the buyer, naming the GenLayer judgment.
4. **Re-check everything.** Clone https://github.com/Leokings/refund-court, run npm ci, pip install -r requirements.txt, then npm run verify:proof (124 checks on both chains). Tests: npm run test:contract, npm run test:evm, npm test.
5. **Use it as an agent.** Follow skills/refund-court/SKILL.md: npm run agent -- broken, then python scripts/release.py file broken.

## Expected verification outcome (372/500)

All 124 checks of npm run verify:proof pass on both chains. The site shows case-1 and case-3 REFUNDED with NOT_MET verdicts quoting the signed response, and case-2 DELIVERED. Each judgment is FINALIZED on GenLayer; each refund moves 0.001 USDC escrow→buyer on Base Sepolia and is recorded REFUNDED only after validators read it. Replay and forgery end in execution errors.

## Evidence

- Repository: https://github.com/Leokings/refund-court
- RefundCourt contract at the deployed commit: https://github.com/Leokings/refund-court/blob/31ec27c2b0a0a96251738c55213751e82ac5a71b/contracts/refund_court.py
- ServicePromise contract at the deployed commit: https://github.com/Leokings/refund-court/blob/31ec27c2b0a0a96251738c55213751e82ac5a71b/contracts/service_promise.py
- RefundEscrow (Base) at the deployed commit: https://github.com/Leokings/refund-court/blob/31ec27c2b0a0a96251738c55213751e82ac5a71b/evm/RefundEscrow.sol
- Release manifest: every transaction on both chains: https://github.com/Leokings/refund-court/blob/31ec27c2b0a0a96251738c55213751e82ac5a71b/deploy/proof.json
- RefundCourt on the GenLayer explorer: https://explorer-studio.genlayer.com/address/0xFB3a0dA4a4c8d1da172ca1064D607fAd2124FAFD
- ServicePromise on the GenLayer explorer: https://explorer-studio.genlayer.com/address/0x39Ad42e19Ea1469787eFE386F53484522028b93f
- RefundEscrow on Base Sepolia: https://sepolia.basescan.org/address/0x7401f61d734719c8fd4062f3cdd062e47ec14e67
- Vague promise refused at compile time: https://explorer-studio.genlayer.com/tx/0xd3421c51a055d1e26ce2015e04fa0648a9384b1fdfcf0c01c8f01b98cbfb5f63
- Judgment: stale Fahrenheit response, REFUND: https://explorer-studio.genlayer.com/tx/0x7674158faa63dede65fdd7d335343c8aa7834d779186845645b3f4707e97f92c
- Judgment: honest response, DELIVERED: https://explorer-studio.genlayer.com/tx/0x54b0229e5aa5eaf0f9670ea689fe1e8ca53b1ebf178d8dedc38b2a4e9f48b629
- Judgment: response that tells the judge to pass it, REFUND: https://explorer-studio.genlayer.com/tx/0x56313a572b8a01c2dcab823ad950ce27cbc70f094c41d86e1c63e56101b16aca
- x402 payment on Base (broken case): https://sepolia.basescan.org/tx/0x7ad4372ec1534013c8262c5e8f2e9c5fa595dfb02be58133d6b7e69f0fa05952
- USDC refund on Base (broken case): https://sepolia.basescan.org/tx/0x71df5894d9ac68f9ebd9a702cc26ca9ecf00e9b875857e83dc8df597917f9e44
- USDC refund on Base (injection case): https://sepolia.basescan.org/tx/0x8ee5e71e2267b98b34b14a8a50f42fd1c476ce9b223bf3dd5fe176a5b850bebb
- Validators verify the refund on Base: https://explorer-studio.genlayer.com/tx/0xca9165258348a58fe25c6b4570baeb985309639a0b9a7afe680c0fac12724fbe
- Expected failure: replayed payment: https://explorer-studio.genlayer.com/tx/0xb187ae925062e117155248fbe66b81141f11e2e05b63ea6401025fa391fdf6c7
- Expected failure: forged signature: https://explorer-studio.genlayer.com/tx/0x6a3f2aa7336508671a3288af46d94498a54154f33238ac89344c9613c51f1ebe
- 45-second video: https://refund-court-x402.vercel.app/video/refund-court.mp4
- Live site: https://refund-court-x402.vercel.app
