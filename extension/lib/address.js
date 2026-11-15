(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SUFFIX = {
    street: "st",
    st: "st",
    avenue: "ave",
    ave: "ave",
    road: "rd",
    rd: "rd",
    boulevard: "blvd",
    blvd: "blvd",
    drive: "dr",
    dr: "dr",
    lane: "ln",
    ln: "ln",
    way: "way",
    place: "pl",
    pl: "pl",
    court: "ct",
    ct: "ct",
    terrace: "ter",
    ter: "ter",
    parkway: "pkwy",
    pkwy: "pkwy",
    highway: "hwy",
    hwy: "hwy"
  };

  function normalizeAddress(input) {
    var text = String(input == null ? "" : input)
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .split(/\n|\|/)[0];
    text = text.replace(/\s[-–—]\s+.*/, "");
    text = text.replace(/[.#,]/g, " ");
    text = text.replace(/['’]/g, "");
    text = text.replace(/\b(?:apartment|apt|unit|suite|ste|floor|fl|bldg|building)\b.*$/, "");
    text = text.replace(/\s+/g, " ").trim();
    if (!text) return "";
    var parts = text.split(" ");
    var limit = Math.min(parts.length, 8);
    for (var i = 0; i < limit; i += 1) {
      var token = parts[i].replace(/\.$/, "");
      if (SUFFIX[token] && i >= 2) {
        parts[i] = SUFFIX[token];
        break;
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function isEntry(value) {
    return value && typeof value === "object" && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng));
  }

  function lookupGeocode(entries, raw) {
    var source = entries || {};
    var norm = normalizeAddress(raw);
    if (!norm) return null;
    if (isEntry(source[norm])) {
      return { lat: Number(source[norm].lat), lng: Number(source[norm].lng), label: source[norm].label || raw, key: norm };
    }
    var keys = Object.keys(source).filter(function (key) {
      return key.length >= 8 && isEntry(source[key]);
    });
    keys.sort(function (a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (norm === key || norm.indexOf(key + " ") === 0 || key.indexOf(norm + " ") === 0) {
        var streetNumber = norm.split(" ")[0];
        if (!/^\d/.test(streetNumber) || key.indexOf(streetNumber + " ") !== 0) continue;
        return { lat: Number(source[key].lat), lng: Number(source[key].lng), label: source[key].label || raw, key: key };
      }
    }
    return null;
  }

  return {
    normalizeAddress: normalizeAddress,
    lookupGeocode: lookupGeocode
  };
});
