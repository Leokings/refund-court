/**
 * The voiceover, one line per scene, voiced with ElevenLabs by ../voice.ts.
 * `at` is when the line starts (seconds); each line must end before its scene does.
 */
export interface VoiceLine {
  id: string;
  at: number;
  sceneEnd: number;
  text: string;
}

export const VOICE_LINES: VoiceLine[] = [
  { id: "01-hook", at: 0.4, sceneEnd: 5, text: "Your agent pays an API. The answer comes back wrong." },
  { id: "02-problem", at: 5.3, sceneEnd: 10, text: "With x402, that money is gone. No chargeback." },
  { id: "03-how", at: 10.3, sceneEnd: 19, text: "Refund Court adds one. The seller signs every response and backs its promise with a USDC bond on Base." },
  { id: "04-judge", at: 19.3, sceneEnd: 27, text: "GenLayer validators check each promise against the signed response, quoting it word for word." },
  { id: "05-live", at: 27.3, sceneEnd: 37, text: "Live: a stale reading got its USDC back. An honest one didn't. One told the judge to pass it. Refunded anyway." },
  { id: "06-skill", at: 37.3, sceneEnd: 41.5, text: "Any agent can use it with one skill." },
  { id: "07-cta", at: 41.7, sceneEnd: 45, text: "Refund Court. Chargebacks for agents." },
];

/** Written by ../voice.ts: which lines have audio, and how long each is (seconds). */
export type VoiceManifest = Record<string, { file: string; seconds: number }>;
