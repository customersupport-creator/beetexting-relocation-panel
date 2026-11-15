import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { rankRelocations } from "../src/libs";
import { clearAvailabilityCache } from "../src/availability";
import { startServer, type RunningServer } from "../src/server";

const facilities = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/facilities.example.json"), "utf8")
) as {
  facilities: Array<{ id: string; lat: number; lng: number; managed?: boolean; name: string }>;
};
const cache = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/geocode-cache.example.json"), "utf8")
) as {
  entries: Record<string, { lat: number; lng: number }>;
};

let running: RunningServer;

test.before(async () => {
  process.env.AVAILABILITY_DELAY_MS = "0";
  process.env.AVAILABILITY_TTL_MS = "30000";
  running = await startServer({ port: 0, host: "127.0.0.1", quiet: true });
});

test.after(async () => {
  await running.close();
});

function url(pathname: string): string {
  return `http://127.0.0.1:${running.port}${pathname}`;
}

test("health reports the example catalog and the mock provider", async () => {
  const response = await fetch(url("/health"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; exampleData: boolean; availabilityProvider: string; facilities: number };
  assert.equal(body.ok, true);
  assert.equal(body.exampleData, true);
  assert.equal(body.availabilityProvider, "mock");
  assert.equal(body.facilities, facilities.facilities.filter((facility) => facility.managed !== false).length);
});

test("nearby ranks the sample Beacon Street booking and skips the unmanaged lot", async () => {
  clearAvailabilityCache();
  const address = "406 Beacon St. - Parallel Spot #4 Only";
  const response = await fetch(url(`/nearby?${new URLSearchParams({
    address,
    start: "2026-11-14T17:30",
    end: "2026-11-14T21:30",
    limit: "5"
  })}`));
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    exampleData: boolean;
    availability: string;
    tookMs: number;
    results: Array<{ id: string; distanceMiles: number; availability: null; sameLocation: boolean }>;
  };
  const origin = cache.entries["406 beacon st"];
  const expected = rankRelocations(origin, facilities.facilities, 5);
  assert.equal(body.exampleData, true);
  assert.equal(body.availability, "pending");
  assert.ok(body.tookMs < 1000);
  assert.deepEqual(
    body.results.map((facility) => facility.id),
    expected.map((facility) => facility.id)
  );
  assert.ok(body.results.every((facility) => facility.availability == null));
  assert.ok(body.results.every((facility) => facility.id !== "ex-unmanaged"));
  assert.equal(body.results[0].sameLocation, false);
  assert.ok(body.results[0].distanceMiles <= body.results[1].distanceMiles);
});

test("POST /nearby accepts JSON and unknown addresses are rejected", async () => {
  const ok = await fetch(url("/nearby"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "75 State St. - Valet Only", limit: 3 })
  });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { results: Array<{ id: string }> };
  assert.equal(body.results.length, 3);

  const missing = await fetch(url("/nearby?address="));
  assert.equal(missing.status, 400);
  const unknown = await fetch(url(`/nearby?${new URLSearchParams({ address: "999 Example Nowhere Boulevard" })}`));
  assert.equal(unknown.status, 422);
  const error = (await unknown.json()) as { error: string; normalized: string };
  assert.equal(error.error, "unknown_address");
  assert.match(error.normalized, /nowhere/);
});

test("availability is cached and the stream emits one event per facility", async () => {
  clearAvailabilityCache();
  const params = new URLSearchParams({
    ids: "ex-park-plaza,ex-beacon-hill",
    start: "2026-11-14T17:30",
    end: "2026-11-14T21:30"
  });
  const first = await fetch(url(`/availability?${params}`));
  const firstBody = (await first.json()) as {
    provider: string;
    results: Record<string, { cached?: boolean; stallsAvailable: number | null; note?: string; status: string }>;
  };
  assert.equal(firstBody.provider, "mock");
  assert.equal(firstBody.results["ex-park-plaza"].cached, false);
  assert.equal(typeof firstBody.results["ex-park-plaza"].stallsAvailable, "number");
  assert.match(firstBody.results["ex-park-plaza"].note || "", /Mock availability/);
  assert.ok(["available", "limited", "unavailable"].includes(firstBody.results["ex-beacon-hill"].status));

  const second = await fetch(url(`/availability?${params}`));
  const secondBody = (await second.json()) as { results: Record<string, { cached?: boolean; stallsAvailable: number | null }> };
  assert.equal(secondBody.results["ex-park-plaza"].cached, true);
  assert.equal(secondBody.results["ex-park-plaza"].stallsAvailable, firstBody.results["ex-park-plaza"].stallsAvailable);

  clearAvailabilityCache();
  const stream = await fetch(url(`/availability/stream?${params}`));
  assert.match(stream.headers.get("content-type") || "", /text\/event-stream/);
  const text = await stream.text();
  assert.match(text, /event: availability/);
  assert.match(text, /ex-park-plaza/);
  assert.match(text, /ex-beacon-hill/);
  assert.match(text, /event: done/);
});
