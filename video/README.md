# The Refund Court video

45 seconds, 1920×1080. Made from the live product with AI tools:

- **Footage:** real screen captures of the live site, the USDC refund on Base (Blockscout) and the judgment
  on the GenLayer explorer, taken by `capture.ts` in a headless browser (`public/shots`).
- **Voice and music:** ElevenLabs (`voice.ts`, script in `src/voiceover.ts`; `music.ts`).
- **Motion and edit:** Remotion (`src/RefundCourt.tsx`).
- **Logos:** Internet Court, GenLayer, x402 (`public/partners`).

```bash
cd video && npm ci
npx tsx capture.ts
npx tsx --env-file=<file with ELEVENLABS_API_KEY> voice.ts
npx tsx --env-file=<file with ELEVENLABS_API_KEY> music.ts
npm run render
```

The render is written to `out/refund-court.mp4`.
