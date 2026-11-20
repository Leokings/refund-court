#!/usr/bin/env tsx
/**
 * Captures the real product for the video at 1920x1080, 2x density: the live site (hero, the
 * broken case with its verdicts, the injection case), the USDC refund on Basescan and the
 * judgment on the GenLayer explorer. Writes PNGs to public/shots.
 *
 *   npx tsx capture.ts
 */
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const CHROME = "node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe";
const p = JSON.parse(readFileSync("../deploy/proof.json", "utf8"));
const SITE = p.website as string;
const broken = p.caseIds.broken as string;
const OUT = "public/shots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--no-sandbox"] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open = async (url: string) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1500);
  return page;
};
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}`);
};
const scrollTo = (page: Page, selector: string, offset = 90) =>
  page.evaluate((s, o) => {
    const el = document.querySelector(s);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o);
  }, selector, offset);

// 1. The site.
const site = await open(SITE);
await shot(site, "site-hero");
await scrollTo(site, "#cases");
await sleep(800);
await shot(site, "site-cases");
// The broken case is open by default; frame its verdicts.
await scrollTo(site, ".case.open .verdicts", 260);
await sleep(800);
await shot(site, "site-broken");
// Open the injection case.
await site.evaluate(() => {
  const head = [...document.querySelectorAll(".case-head")].find((b) => /trick the judge/i.test(b.textContent ?? ""));
  (head as HTMLElement | undefined)?.click();
});
await sleep(800);
await scrollTo(site, ".case.open .response", 120);
await sleep(800);
await shot(site, "site-injection");
await scrollTo(site, "#use");
await sleep(800);
await shot(site, "site-use");

// 2. The USDC refund on Basescan.
const refund = p.base.payouts[broken].tx as string;
const scan = await open(`https://sepolia.basescan.org/tx/${refund}`);
await sleep(2500);
await shot(scan, "basescan-refund");

// 3. The judgment on the GenLayer explorer.
const gl = await open(`https://explorer-studio.genlayer.com/tx/${p.transactions["judge-broken"]}`);
await gl.waitForFunction(() => document.body.innerText.includes("FINALIZED"), { timeout: 120_000 });
await sleep(2000);
await shot(gl, "genlayer-judge");

await browser.close();
