const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { haversineMiles, rankRelocations } = require("../extension/lib/geo.js");

const root = path.join(__dirname, "..");

test("committed facilities are fictional examples and the unmanaged pin is not offered", () => {
  const raw = fs.readFileSync(path.join(root, "backend/data/facilities.example.json"), "utf8");
  assert.match(raw, /Fictional sample facilities/);
  assert.doesNotMatch(raw, /pat[A-Za-z0-9]{14,}|sk_live_|AKIA[0-9A-Z]{16}/);
  const data = JSON.parse(raw);
  assert.equal(data.source, "example");
  const cache = require("../backend/data/geocode-cache.example.json");
  const origin = cache.entries["406 beacon st"];
  const unmanaged = data.facilities.find((facility) => facility.id === "ex-unmanaged");
  assert.equal(unmanaged.managed, false);
  const unmanagedDistance = haversineMiles(origin, unmanaged);
  for (const facility of data.facilities) {
    assert.equal(facility.example, true);
    assert.match(facility.name, /^EXAMPLE/);
    assert.equal(typeof facility.lat, "number");
    assert.equal(typeof facility.lng, "number");
    if (facility.managed === false) continue;
    assert.ok(
      haversineMiles(origin, facility) > unmanagedDistance,
      `${facility.id} should be farther than the unmanaged decoy`
    );
  }
  const ranked = rankRelocations(origin, data.facilities, 8);
  assert.ok(ranked.length >= 5);
  assert.ok(ranked.every((facility) => facility.id !== "ex-unmanaged"));
  for (let i = 1; i < ranked.length; i += 1) {
    const previous = ranked[i - 1];
    const current = ranked[i];
    if (previous.sameLocation === current.sameLocation) {
      assert.ok(current.distanceMiles >= previous.distanceMiles);
    } else {
      assert.equal(previous.sameLocation, false);
      assert.equal(current.sameLocation, true);
    }
  }
});

test("the env example does not contain a token", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(env, /^AIRTABLE_TOKEN=\s*$/m);
  assert.match(env, /^AIRTABLE_BASE_ID=\s*$/m);
});
