#!/usr/bin/env tsx
/**
 * A short, quiet music bed for the video, generated with ElevenLabs' sound generation, saved to
 * public/audio/bed.mp3. Run once; the file is reused after that.
 *
 *   npx tsx --env-file=<file with ELEVENLABS_API_KEY> music.ts
 */
import { existsSync, writeFileSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY is not set (load it with --env-file; never paste it into chat).");
  process.exit(1);
}
const OUT = "public/audio/bed.mp3";
if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`${OUT} exists (use --force to make a new one)`);
  process.exit(0);
}
const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
  method: "POST",
  headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
  body: JSON.stringify({
    text: "Playful, light electronic background music for a product explainer: soft plucked synth melody, gentle bouncy beat, warm bass, upbeat and friendly, no vocals, steady loopable groove.",
    duration_seconds: 22,
    prompt_influence: 0.6,
  }),
});
if (!res.ok) {
  console.error(`ElevenLabs ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${OUT}`);
