"use client";
import { useMemo, useState } from "react";
import { basePayment, explorer } from "@/lib/explorer";
import { short, usdc, type CourtCase, type Proof, type Service } from "@/lib/domain";

type Live = { services: Service[]; claimCases: CourtCase[]; readAt: string } | null;

const MODE_TITLE: Record<string, string> = {
  broken: "Broken promise",
  honest: "Promise kept",
  injection: "Tried to trick the judge",
};
const STAMP: Record<string, [string, string]> = {
  REFUNDED: ["ok", "Refunded"],
  REFUND: ["warn", "Refund due"],
  DELIVERED: ["neutral", "Delivered"],
  VOID: ["neutral", "Void"],
  JUDGED: ["neutral", "Judged"],
  FILED: ["warn", "Waiting on Base"],
};

function Out({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a className="pill" href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}

function safe(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function CaseCard({ c, mode, proof, open, onToggle }: { c: CourtCase; mode: string; proof: Proof; open: boolean; onToggle: () => void }) {
  const [tone, label] = STAMP[c.status] ?? ["neutral", c.status];
  const judge = proof.verdictTx?.[mode] ?? proof.transactions[`judge-${mode}`];
  const file = proof.transactions[`file-${mode}`];
  const payoutRecord = proof.transactions[`payout-${mode}`];
  const refundTx = proof.base?.payouts?.[c.id]?.tx;
  let body: Record<string, unknown> = {};
  let signed: { service_id?: string; promise_hash?: string } = {};
  try {
    body = JSON.parse(c.response);
    signed = JSON.parse(c.request);
  } catch {}
  const waiting = c.status === "FILED" && (c.attempts ?? 0) > 0;
  return (
    <article className={`case ${open ? "open" : ""}`}>
      <button className="case-head" onClick={onToggle} aria-expanded={open}>
        <span className={`stamp ${tone}`}>{label}</span>
        <span className="case-title">{MODE_TITLE[mode] ?? mode}</span>
        <span className="case-meta">
          {c.id} · paid {usdc(c.price_units)} USDC{c.status === "REFUNDED" ? ` · got ${usdc(c.refund_units)} back` : ""}
        </span>
      </button>
      {open && (
        <div className="case-body">
          <div className="response">
            <div className="label">Signed response</div>
            <code>
              {Object.entries(body).map(([k, v]) => (
                <span key={k} className={k === "instructions" ? "attack" : ""}>
                  &quot;{k}&quot;: {JSON.stringify(v)}
                  <br />
                </span>
              ))}
            </code>
          </div>
          <p className="terms">
            Sold under {signed.service_id} · promise <code>{signed.promise_hash?.slice(0, 12)}…</code>, signed by the seller
            {c.attempts ? ` · judged after ${c.attempts} payment check${c.attempts > 1 ? "s" : ""}` : ""}
          </p>
          {waiting && <p className="terms">Payment not confirmed on Base yet ({c.reason}). The claim stays filed; anyone can retry.</p>}
          <ul className="verdicts">
            {c.verdicts.map((v) => (
              <li key={v.criterion} className={v.verdict === "MET" ? "met" : v.verdict === "NOT_MET" ? "notmet" : "unclear"}>
                <b>{v.verdict.replace("_", " ")}</b>
                <span>{v.criterion}</span>
                <q>{v.quote}</q>
              </li>
            ))}
            {!c.verdicts.length && !waiting && <li className="unclear">No criterion was judged: {c.reason || "payment not confirmed"}.</li>}
          </ul>
          <div className="pills">
            <Out href={safe(() => basePayment(c.payment_hash))}>x402 payment · Base</Out>
            <Out href={file ? safe(() => explorer("tx", file)) : null}>Claim filed · GenLayer</Out>
            <Out href={judge ? safe(() => explorer("tx", judge)) : null}>Judgment · GenLayer</Out>
            <Out href={refundTx ? safe(() => basePayment(refundTx)) : null}>USDC refund · Base</Out>
            <Out href={payoutRecord ? safe(() => explorer("tx", payoutRecord)) : null}>Refund verified · GenLayer</Out>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Court({ proof }: { proof: Proof }) {
  const [live, setLive] = useState<Live>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(proof.caseIds?.broken ?? null);
  const cases = live?.claimCases ?? proof.claimCases ?? [];
  const services = live?.services ?? proof.services ?? [];
  const modeOf = (c: CourtCase) => proof.caseModes?.[c.id] ?? services.find((s) => s.id === c.service_id)?.endpoint.split("/").pop() ?? "";
  const ordered = useMemo(() => {
    const rank: Record<string, number> = { broken: 0, injection: 1, honest: 2 };
    return [...cases].sort((a, b) => (rank[modeOf(a)] ?? 9) - (rank[modeOf(b)] ?? 9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases]);
  const frozen = services.find((s) => s.status === "FROZEN");
  const rejected = services.find((s) => s.status === "REJECTED");
  const escrow = proof.base?.escrow?.address;
  const replay = proof.transactions["reject-replay"];
  const forgery = proof.transactions["reject-forgery"];

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.error ?? "Live read failed");
      setLive(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live read failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="top">
        <div className="wrap bar">
          <a className="brand" href="#">
            <span className="mark" aria-hidden />
            Refund Court
          </a>
          <nav>
            <a href="#cases">Cases</a>
            <a href="#how">How it works</a>
            <a href="#use">Use it</a>
            <a href={proof.github ?? "#"} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Internet Court × x402 × GenLayer</p>
          <h1>
            Chargebacks
            <br />
            for agents.
          </h1>
          <p className="lede">An agent pays an API with x402. If the response breaks the seller&apos;s promise, GenLayer rules and the buyer gets the USDC back.</p>
          <div className="facts">
            <div>
              <b>0.001 USDC</b>
              <span>paid with x402</span>
            </div>
            <div>
              <b>0.001 USDC</b>
              <span>refunded on a breach</span>
            </div>
            <div>
              <b>Base Sepolia</b>
              <span>same chain, same token</span>
            </div>
          </div>
        </div>
      </section>

      <section id="cases" className="wrap block">
        <div className="head">
          <h2>Live cases</h2>
          <button className="ghost" onClick={refresh} disabled={loading}>
            {loading ? "Reading…" : live ? "Refresh" : "Read live from GenLayer"}
          </button>
        </div>
        <p className="note">
          {live ? `Live read ${new Date(live.readAt).toUTCString()}` : proof.recordedAt ? `Recorded ${new Date(proof.recordedAt).toUTCString()}` : "No cases recorded yet."}
          {error && <span className="err"> · {error}</span>}
        </p>
        {frozen && (
          <div className="promise">
            <div className="label">The seller&apos;s frozen promise</div>
            <p>“{frozen.promise}”</p>
            <ol>
              {frozen.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
          </div>
        )}
        <div className="cases">
          {ordered.map((c) => (
            <CaseCard key={c.id} c={c} mode={modeOf(c)} proof={proof} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
          ))}
        </div>
        <div className="guards">
          {rejected && (
            <div>
              <span className="stamp neutral">Rejected</span> A vague promise — “{rejected.promise}” — is refused before it can be sold.
            </div>
          )}
          {(replay || forgery) && (
            <div>
              <span className="stamp neutral">Blocked</span> Reusing a payment or editing a signed response is rejected by code.{" "}
              <Out href={replay ? safe(() => explorer("tx", replay)) : null}>replay</Out> <Out href={forgery ? safe(() => explorer("tx", forgery)) : null}>forgery</Out>
            </div>
          )}
        </div>
      </section>

      <section id="how" className="how">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <b>Promise</b>
              <span>The seller states what its API returns. GenLayer turns it into checkable criteria, or rejects it.</span>
            </li>
            <li>
              <b>Bond</b>
              <span>The seller locks USDC in the refund escrow on Base.</span>
            </li>
            <li>
              <b>Pay</b>
              <span>An agent pays with x402. The seller signs exactly what it sent back.</span>
            </li>
            <li>
              <b>Judge</b>
              <span>Validators confirm the payment, then rule on each criterion with a quote.</span>
            </li>
            <li>
              <b>Refund</b>
              <span>A breach pays the buyer back from the bond. GenLayer checks the refund landed.</span>
            </li>
          </ol>
        </div>
      </section>

      <section id="use" className="wrap block">
        <h2>Use it</h2>
        <div className="use">
          <pre>
            <span className="c"># pay a seller with x402 and keep the signed evidence</span>
            {"\n"}npm run agent -- broken
            {"\n\n"}
            <span className="c"># file it, get it judged, get refunded</span>
            {"\n"}python scripts/release.py file broken
            {"\n"}npx tsx scripts/base.ts refund case-1
          </pre>
          <p>
            Agents can follow the <a href={`${proof.github}/blob/main/skills/refund-court/SKILL.md`}>Refund Court skill</a>. Everything here is recorded in the{" "}
            <a href={`${proof.github}/blob/main/deploy/proof.json`}>proof file</a>.
          </p>
        </div>
      </section>

      <footer className="wrap foot">
        <span>Test networks only: GenLayer StudioNet and Base Sepolia.</span>
        <span>
          {proof.contracts.RefundCourt && (
            <a href={safe(() => explorer("address", proof.contracts.RefundCourt.address)) ?? "#"} target="_blank" rel="noopener noreferrer">
              court {short(proof.contracts.RefundCourt.address)}
            </a>
          )}
          {escrow && (
            <>
              {" · "}
              <a href={`https://sepolia.basescan.org/address/${escrow}`} target="_blank" rel="noopener noreferrer">
                escrow {short(escrow)}
              </a>
            </>
          )}
        </span>
      </footer>
    </div>
  );
}
