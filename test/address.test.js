const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAddress, lookupGeocode } = require("../extension/lib/address.js");
const cache = require("../backend/data/geocode-cache.example.json");

test("normalizes street suffixes and drops spot notes", () => {
  assert.equal(normalizeAddress("406 Beacon St. - Parallel Spot #4 Only"), "406 beacon st");
  assert.equal(normalizeAddress("406 Beacon Street, Boston, MA 02115"), "406 beacon st boston ma 02115");
  assert.equal(normalizeAddress("75 State St. - Valet Only"), "75 state st");
});

test("looks up sample addresses from the committed geocode cache", () => {
  const beacon = lookupGeocode(cache.entries, "406 Beacon St. - Parallel Spot #4 Only");
  assert.equal(beacon.key, "406 beacon st");
  assert.equal(beacon.lat, cache.entries["406 beacon st"].lat);
  const withCity = lookupGeocode(cache.entries, "406 Beacon Street, Boston, MA 02115");
  assert.equal(withCity.key, "406 beacon st");
  const state = lookupGeocode(cache.entries, "75 State St. - Valet Only");
  assert.equal(state.label, "75 State St, Boston, MA 02109");
  assert.equal(lookupGeocode(cache.entries, "999 Example Nowhere Boulevard"), null);
});
