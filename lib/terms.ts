// The terms a paid response is sold under. The seller signs them into every request, and
// RefundCourt.file_claim only accepts evidence whose signed terms equal the claim's frozen
// service id and promise hash.
import type { Service } from "./domain";

export type Terms = { service_id: string; promise_hash: string };

/** The one frozen, bonded promise for this endpoint, or null when the seller has none to sell under. */
export function sellerTerms(
  services: Service[] | undefined,
  endpoint: string,
  bonded?: Record<string, unknown>,
): Terms | null {
  const frozen = (services ?? []).filter(
    (s) =>
      s.status === "FROZEN" &&
      s.endpoint === endpoint &&
      /^[0-9a-f]{64}$/.test(s.hash) &&
      (!bonded || s.id in bonded),
  );
  if (frozen.length !== 1) return null;
  return { service_id: frozen[0].id, promise_hash: frozen[0].hash };
}

/** The exact request string the seller signs. Key order is fixed so the bytes are reproducible. */
export function signedRequest(r: {
  buyer: string;
  city: string;
  endpoint: string;
  deliveredAt: number;
  nonce: string;
  terms: Terms;
}): string {
  return JSON.stringify({
    buyer: r.buyer.toLowerCase(),
    city: r.city,
    endpoint: r.endpoint,
    delivered_at: r.deliveredAt,
    nonce: r.nonce,
    service_id: r.terms.service_id,
    promise_hash: r.terms.promise_hash,
  });
}

/** Buyer side: true when signed evidence names exactly the frozen terms the buyer agreed to. */
export function termsMatch(request: string, expected: Terms): boolean {
  try {
    const r = JSON.parse(request) as Partial<Terms>;
    return r.service_id === expected.service_id && r.promise_hash === expected.promise_hash;
  } catch {
    return false;
  }
}
