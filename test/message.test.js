const test = require("node:test");
const assert = require("node:assert/strict");
const { customerMessage, formatMiles } = require("../extension/lib/message.js");

test("formats distance and a customer-ready relocation text", () => {
  assert.equal(formatMiles(0.04), "under 0.1 mi");
  assert.equal(formatMiles(0.32), "0.3 mi");
  const text = customerMessage({
    originalFacility: "406 Beacon St. - Parallel Spot #4 Only",
    facility: {
      name: "EXAMPLE — Park Plaza Garage",
      address: "50 Park Plaza, Boston, MA 02116"
    },
    distanceMiles: 0.32,
    windowLabel: "Sat Nov 14, 2026 5:30 PM-9:30 PM",
    availability: { status: "available", stallsAvailable: 14 }
  });
  assert.match(text, /406 Beacon St/);
  assert.match(text, /Park Plaza Garage/);
  assert.doesNotMatch(text, /EXAMPLE/);
  assert.match(text, /50 Park Plaza/);
  assert.match(text, /0\.3 mi/);
  assert.match(text, /14 stalls show as open/);
  assert.match(text, /Reply YES/);
});

test("omits stall counts until availability is known and warns when a facility is full", () => {
  const pending = customerMessage({
    originalAddress: "406 Beacon St",
    facility: { name: "EXAMPLE — Beacon Hill Garage", address: "34 Beacon St" },
    distanceMiles: 0.4,
    availability: null
  });
  assert.doesNotMatch(pending, /stall/);
  const full = customerMessage({
    originalAddress: "406 Beacon St",
    facility: { name: "Beacon Hill Garage", address: "34 Beacon St" },
    distanceMiles: 0.4,
    availability: { status: "unavailable", stallsAvailable: 0 }
  });
  assert.match(full, /not showing open stalls/);
  const one = customerMessage({
    originalAddress: "406 Beacon St",
    facility: { name: "Beacon Hill Garage", address: "34 Beacon St" },
    distanceMiles: 1,
    availability: { status: "limited", stallsAvailable: 1 }
  });
  assert.match(one, /1 stall shows as open/);
});
