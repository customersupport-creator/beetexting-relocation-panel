const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractBooking } = require("../extension/lib/extract.js");

const BEACON = [
  "Hi — the garage entrance on Beacon is blocked and I can't get into my spot.",
  "",
  "SpotHero confirmation",
  "Facility: 406 Beacon St. - Parallel Spot #4 Only",
  "Rental ID: R-184293",
  "Plate: 8ABC12",
  "Sat Nov 14, 2026 5:30 PM-9:30 PM"
].join("\n");

test("extracts the sample Beetexting booking", () => {
  const booking = extractBooking(BEACON);
  assert.equal(booking.confidence, "high");
  assert.match(booking.address, /^406 Beacon St\b/);
  assert.match(booking.facilityLabel, /406 Beacon St/);
  assert.match(booking.facilityLabel, /Parallel Spot #4 Only/);
  assert.match(booking.spotNote, /Parallel Spot #4 Only/i);
  assert.equal(booking.rentalId, "R-184293");
  assert.equal(booking.plate, "8ABC12");
  assert.equal(booking.start, "2026-11-14T17:30");
  assert.equal(booking.end, "2026-11-14T21:30");
  assert.match(booking.windowLabel, /Nov 14, 2026/);
  assert.match(booking.windowLabel, /5:30 PM/);
});

test("parses numeric dates, ISO ranges, lowercase times, and overnight windows", () => {
  const numeric = extractBooking("Facility: 75 State St. - Valet Only\n11/13/2026 8:00 AM - 6:00 PM");
  assert.match(numeric.address, /^75 State St\b/);
  assert.match(numeric.spotNote, /Valet Only/i);
  assert.equal(numeric.start, "2026-11-13T08:00");
  assert.equal(numeric.end, "2026-11-13T18:00");

  const iso = extractBooking("2026-11-14T17:30-21:30 at 406 Beacon Street");
  assert.equal(iso.start, "2026-11-14T17:30");
  assert.equal(iso.end, "2026-11-14T21:30");
  assert.match(iso.address, /^406 Beacon St/);

  const lowercase = extractBooking("sat nov 14, 2026 5:30pm-9:30pm\n406 Beacon St");
  assert.equal(lowercase.start, "2026-11-14T17:30");
  assert.equal(lowercase.end, "2026-11-14T21:30");

  const overnight = extractBooking("Sat Nov 14, 2026 10:00 PM-1:00 AM\nFacility: 406 Beacon St.");
  assert.equal(overnight.start, "2026-11-14T22:00");
  assert.equal(overnight.end, "2026-11-15T01:00");

  const inherited = extractBooking("Sat Nov 14, 2026 5:30-9:30 PM\n406 Beacon St.");
  assert.equal(inherited.start, "2026-11-14T17:30");
  assert.equal(inherited.end, "2026-11-14T21:30");
});

test("prefers the labeled facility over an earlier street address and the nearer time window", () => {
  const text = [
    "Shuttle note: 10 Memorial Drive, Cambridge, MA 02142",
    "Sat Nov 14, 2026 1:00 PM-1:30 PM",
    "Facility: 406 Beacon St. - Parallel Spot #4 Only",
    "Sat Nov 14, 2026 5:30 PM-9:30 PM"
  ].join("\n");
  const booking = extractBooking(text);
  assert.match(booking.address, /^406 Beacon St\b/);
  assert.equal(booking.start, "2026-11-14T17:30");
  assert.doesNotMatch(booking.address, /Memorial/);
});

test("joins a date and a time that are not on the same line", () => {
  const booking = extractBooking("Facility: 406 Beacon St.\nSat Nov 14, 2026\nWindow: 5:30 PM-9:30 PM");
  assert.equal(booking.start, "2026-11-14T17:30");
  assert.equal(booking.end, "2026-11-14T21:30");
});

test("returns an empty booking instead of throwing on blank or noisy text", () => {
  for (const input of [null, undefined, "", 12, "thanks, see you there"]) {
    const booking = extractBooking(input);
    assert.equal(booking.confidence, "none");
    assert.equal(booking.address, null);
    assert.equal(booking.start, null);
  }
  const buried = `${"hello ".repeat(2000)}\n${BEACON}`;
  assert.equal(extractBooking(buried).start, "2026-11-14T17:30");
});

test("the mock inbox mirrors the logged-in Beetexting DOM and contains the sample booking", () => {
  const html = fs.readFileSync(path.join(__dirname, "../mock/index.html"), "utf8");
  assert.match(html, /class="conversation-card active"/);
  assert.match(html, /class="card-wrapper"/);
  assert.match(html, /<app-texting-scroller>/);
  assert.match(html, /class="roll-container"/);
  assert.match(html, /class="messages-wrapper"/);
  assert.match(html, /class="message-block" data-id=/);
  assert.match(html, /class="message incoming"/);
  assert.match(html, /class="message outgoing"/);
  assert.match(html, /id="contact-title-name" class="contact-name"/);
  assert.match(html, /id="contact-phone-number" class="contact-phone-number"/);
  assert.match(html, /id="contact-phone-link" href="tel:/);
  assert.match(html, /class="column-block contact-block"/);
  assert.match(html, /<app-contact-panel>/);
  assert.match(html, /class="consent-section"/);
  assert.match(html, /class="sequence-tags-section"/);
  assert.match(html, /class="tags-section"/);
  assert.match(html, /class="notes-section"/);
  assert.doesNotMatch(html, /_ngcontent|ng-star-inserted/);
  const slice = html.match(/data-sample="beacon">([\s\S]*?)<\/div>/);
  assert.ok(slice, "mock page is missing the beacon sample message");
  const text = slice[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const booking = extractBooking(text);
  assert.equal(booking.start, "2026-11-14T17:30");
  assert.equal(booking.end, "2026-11-14T21:30");
  assert.match(booking.address, /406 Beacon St/);
  assert.equal(booking.plate, "8ABC12");
});
