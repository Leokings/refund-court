# Refund Court

Use exact pinned GenLayer SDK and runner versions. Never spend test USDC on payments without the
owner's recorded approval in `.secrets/deposit-approval.json`. Never submit the Portal form.

Every GenLayer submission must include each deployed contract's direct canonical GenLayer Explorer
address URL as a separate evidence entry, type `GenLayer Explorer Contract`. Use `lib/explorer.ts`
for every GenLayer link and Basescan (Base Sepolia) for every Base link.

`npm run verify:proof` must fail while any required live case, Base bond, payment or refund proof is
missing. Never substitute test fixtures or mocked cases for live proof. Keep credentials under
ignored `.secrets/` and server-only environment variables; never print them.

The site must work on desktop and on phones.
