(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Mean Earth radius in miles. Tests lock the 1-degree latitude distance to this.
  var EARTH_RADIUS_MILES = 3958.7613;
  var SAME_LOCATION_MILES = 0.05;

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function haversineMiles(a, b) {
    var lat1 = toRadians(Number(a.lat));
    var lat2 = toRadians(Number(b.lat));
    var dLat = toRadians(Number(b.lat) - Number(a.lat));
    var dLng = toRadians(Number(b.lng) - Number(a.lng));
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function sanitizeLimit(limit) {
    var n = Number(limit);
    if (!Number.isFinite(n) || n <= 0) return 5;
    return Math.max(1, Math.min(20, Math.floor(n)));
  }

  function assertOrigin(origin) {
    if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng))) {
      throw new TypeError("origin must include numeric lat and lng");
    }
  }

  function rankFacilities(origin, facilities, limit) {
    assertOrigin(origin);
    var ranked = [];
    var list = facilities || [];
    for (var i = 0; i < list.length; i += 1) {
      var facility = list[i];
      if (!facility || facility.managed === false) continue;
      if (facility.lat == null || facility.lng == null || facility.lat === "" || facility.lng === "") continue;
      var lat = Number(facility.lat);
      var lng = Number(facility.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      var copy = Object.assign({}, facility, { lat: lat, lng: lng });
      copy.distanceMiles = haversineMiles(origin, copy);
      ranked.push(copy);
    }
    ranked.sort(function (a, b) {
      var delta = a.distanceMiles - b.distanceMiles;
      if (delta) return delta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    if (limit == null) return ranked;
    return ranked.slice(0, sanitizeLimit(limit));
  }

  // Relocation search: a facility sitting on the booked pin is a poor
  // suggestion, so it sorts after real alternatives.
  function rankRelocations(origin, facilities, limit) {
    var ranked = rankFacilities(origin, facilities, null);
    for (var i = 0; i < ranked.length; i += 1) {
      ranked[i].sameLocation = ranked[i].distanceMiles <= SAME_LOCATION_MILES;
    }
    ranked.sort(function (a, b) {
      var same = Number(a.sameLocation) - Number(b.sameLocation);
      if (same) return same;
      var delta = a.distanceMiles - b.distanceMiles;
      if (delta) return delta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return ranked.slice(0, sanitizeLimit(limit));
  }

  return {
    EARTH_RADIUS_MILES: EARTH_RADIUS_MILES,
    SAME_LOCATION_MILES: SAME_LOCATION_MILES,
    haversineMiles: haversineMiles,
    sanitizeLimit: sanitizeLimit,
    rankFacilities: rankFacilities,
    rankRelocations: rankRelocations
  };
});
