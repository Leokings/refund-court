#!/usr/bin/env tsx
/**
 * Voices the video with ElevenLabs: one MP3 per line in src/voiceover.ts, into public/audio/, plus
 * a manifest with each clip's length. Fails if a line runs past the end of its scene.
 *
 *   npx tsx --env-file=<file with ELEVENLABS_API_KEY> voice.ts
 *
 * Clips that already exist with the same text are not generated again.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { VOICE_LINES, type VoiceManifest } from "./src/voiceover";

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // "George": warm, clear narration
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const MANIFEST = "src/voiceover.json";
if (!KEY) {
  console.error("ELEVENLABS_API_KEY is not set (load it with --env-file; never paste it into chat).");
  process.exit(1);
}

const seconds = (file: string) => Number(execFileSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", shell: true }).trim().split(/\s+/).pop());

mkdirSync("public/audio", { recursive: true });
const saved: VoiceManifest & { _texts?: Record<string, string> } = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const texts: Record<string, string> = saved._texts ?? {};
const manifest: VoiceManifest = {};
let problems = 0;

for (const line of VOICE_LINES) {
  const file = `audio/vo-${line.id}.mp3`;
  if (!(existsSync(`public/${file}`) && texts[line.id] === line.text)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: line.text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true } }),
    });
    if (!res.ok) {
      console.error(`${line.id}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    writeFileSync(`public/${file}`, Buffer.from(await res.arrayBuffer()));
    texts[line.id] = line.text;
  }
  const s = seconds(`public/${file}`);
  manifest[line.id] = { file, seconds: s };
  const room = line.sceneEnd - line.at;
  if (s > room) problems++;
  console.log(`${s <= room ? "✓" : "✗"} ${line.id}: ${s.toFixed(2)}s of ${room.toFixed(2)}s`);
}
writeFileSync(MANIFEST, JSON.stringify({ ...manifest, _texts: texts }, null, 2) + "\n");
console.log(problems ? `${problems} line(s) too long for their scene.` : `Voiceover ready: ${MANIFEST}`);
process.exitCode = problems ? 1 : 0;
