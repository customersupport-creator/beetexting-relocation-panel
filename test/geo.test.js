const test = require("node:test");
const assert = require("node:assert/strict");
const { haversineMiles, rankFacilities, rankRelocations, EARTH_RADIUS_MILES } = require("../extension/lib/geo.js");

test("haversine is zero at one point and one degree of latitude matches the earth radius", () => {
  assert.equal(haversineMiles({ lat: 42.35, lng: -71.07 }, { lat: 42.35, lng: -71.07 }), 0);
  const degree = (EARTH_RADIUS_MILES * Math.PI) / 180;
  assert.ok(Math.abs(haversineMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - degree) < 1e-6);
  assert.ok(Math.abs(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - degree) < 1e-6);
  const atSixty = haversineMiles({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
  assert.ok(Math.abs(atSixty - degree * Math.cos((60 * Math.PI) / 180)) < 0.05);
});

test("ranks by distance, drops unmanaged or unlocated rows, and caps the list", () => {
  const origin = { lat: 0, lng: 0 };
  const facilities = [
    { id: "far", name: "Far", lat: 1, lng: 0, managed: true },
    { id: "near", name: "Near", lat: 0.1, lng: 0, managed: true },
    { id: "closed", name: "Closed", lat: 0.01, lng: 0, managed: false },
    { id: "noloc", name: "No location", lat: null, lng: null, managed: true },
    { id: "mid", name: "Mid", lat: 0.4, lng: 0, managed: true }
  ];
  const ranked = rankFacilities(origin, facilities, 2);
  assert.deepEqual(ranked.map((facility) => facility.id), ["near", "mid"]);
  assert.ok(ranked[0].distanceMiles < ranked[1].distanceMiles);
  assert.equal(rankFacilities(origin, facilities).length, 3);
});

test("relocation ranking offers a farther facility before the booked pin", () => {
  const origin = { lat: 0, lng: 0 };
  const facilities = [
    { id: "b", name: "B Lot", lat: 0, lng: 0, managed: true },
    { id: "far", name: "Far Lot", lat: 0.2, lng: 0, managed: true },
    { id: "a", name: "A Lot", lat: 0, lng: 0, managed: true }
  ];
  const ranked = rankRelocations(origin, facilities, 5);
  assert.deepEqual(ranked.map((facility) => facility.id), ["far", "a", "b"]);
  assert.equal(ranked[0].sameLocation, false);
  assert.equal(ranked[1].sameLocation, true);
  assert.deepEqual(rankRelocations(origin, facilities, 1).map((facility) => facility.id), ["far"]);
});

test("rejects an origin without coordinates", () => {
  assert.throws(() => rankFacilities({ lat: "north", lng: 1 }, []), TypeError);
});
