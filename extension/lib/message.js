(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function formatMiles(miles) {
    var value = Number(miles);
    if (!Number.isFinite(value)) return "an unknown distance";
    if (value < 0.1) return "under 0.1 mi";
    if (value < 10) return value.toFixed(1) + " mi";
    return Math.round(value) + " mi";
  }

  function customerFacingName(name) {
    return String(name || "a nearby facility").replace(/^EXAMPLE\s+[—-]\s+/i, "");
  }

  function customerMessage(input) {
    var facility = input && input.facility ? input.facility : {};
    var name = customerFacingName(facility.name);
    var address = facility.address || "the facility address on file";
    var booked = input && (input.originalFacility || input.originalAddress) || "your booked facility";
    if (booked.length > 100) booked = (input && input.originalAddress) || booked.slice(0, 100);
    var when = input && input.windowLabel ? " for " + input.windowLabel : "";
    var availability = input && input.availability;
    var stalls = "";
    if (availability && availability.status === "unavailable") {
      stalls = " It is not showing open stalls right now.";
    } else if (availability && typeof availability.stallsAvailable === "number") {
      var count = availability.stallsAvailable;
      stalls = count === 1 ? " 1 stall shows as open." : " " + count + " stalls show as open.";
    }
    return "Hi — sorry your spot at " + booked + " isn't available. We can move you to " +
      name + " at " + address + " (" + formatMiles(input && input.distanceMiles) + " away)" +
      when + "." + stalls + " Reply YES and I'll update the booking.";
  }

  return {
    formatMiles: formatMiles,
    customerFacingName: customerFacingName,
    customerMessage: customerMessage
  };
});
