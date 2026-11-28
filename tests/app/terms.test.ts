import test from "node:test";
import assert from "node:assert/strict";
import { sellerTerms, signedRequest, termsMatch } from "../../lib/terms";
import type { Service } from "../../lib/domain";

const E = "https://refund-court.example/api/weather/broken";
const svc = (id: string, hash: string, endpoint = E, status = "FROZEN") =>
  ({ id, hash, endpoint, status, seller: "0x" + "11".repeat(20) }) as Service;
const H = (c: string) => c.repeat(64);

test("the seller sells only under its one bonded frozen promise for the endpoint", () => {
  const services = [svc("service-3", H("a")), svc("service-5", H("b")), svc("service-2", H("c"), E.replace("broken", "honest"))];
  const bonds = { "service-3": {}, "service-2": {} };
  assert.deepEqual(sellerTerms(services, E, bonds), { service_id: "service-3", promise_hash: H("a") });
  // The other frozen promise on the same endpoint is unbonded, so it is never offered.
  assert.equal(sellerTerms([svc("service-5", H("b"))], E, bonds), null);
  // No frozen promise, or an ambiguous pair, means nothing is sold.
  assert.equal(sellerTerms([svc("service-3", H("a"), E, "COMPILING")], E, bonds), null);
  assert.equal(sellerTerms(services, E), null);
});

test("the signed request carries the agreed terms in a fixed order", () => {
  const terms = { service_id: "service-3", promise_hash: H("a") };
  const request = signedRequest({ buyer: "0xABC", city: "Lagos", endpoint: E, deliveredAt: 1, nonce: "nonce-123", terms });
  assert.deepEqual(Object.keys(JSON.parse(request)), ["buyer", "city", "endpoint", "delivered_at", "nonce", "service_id", "promise_hash"]);
  assert.equal(JSON.parse(request).buyer, "0xabc");
  assert.ok(termsMatch(request, terms));
  // The buyer refuses evidence signed under any other terms.
  assert.ok(!termsMatch(request, { service_id: "service-5", promise_hash: H("b") }));
  assert.ok(!termsMatch(request, { service_id: "service-3", promise_hash: H("b") }));
  assert.ok(!termsMatch("not json", terms));
});
