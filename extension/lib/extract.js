(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
  };

  var MONTH = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
  var WEEKDAY = "(?:\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b[,]?\\s+)?";
  var TIME = "(\\d{1,2})(?::|\\.)(\\d{2})\\s*(am|pm)?";
  var SEP = "\\s*(?:-|–|—|to)\\s*";
  var TZ = "(?:\\s+(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC))?";
  var SUFFIX = "street|st\\.?|avenue|ave\\.?|road|rd\\.?|boulevard|blvd\\.?|drive|dr\\.?|lane|ln\\.?|way|place|pl\\.?|court|ct\\.?|terrace|ter\\.?|parkway|pkwy\\.?|highway|hwy\\.?";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function cleanText(input) {
    var text = String(input == null ? "" : input).replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n");
    if (text.length > 100000) text = text.slice(0, 100000);
    return text;
  }

  function validDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function addDays(year, month, day, days) {
    var date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function toHour(hour, ampm) {
    var h = Number(hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return null;
    if (!ampm) {
      if (h > 23) return null;
      return h;
    }
    if (h < 1 || h > 12) return null;
    var marker = ampm.toLowerCase();
    if (marker === "am") return h === 12 ? 0 : h;
    if (marker === "pm") return h === 12 ? 12 : h + 12;
    return null;
  }

  function stamp(year, month, day, hour, minute) {
    return year + "-" + pad(month) + "-" + pad(day) + "T" + pad(hour) + ":" + pad(minute);
  }

  function buildWindow(match) {
    var startAmpm = match.sampm || "";
    var endAmpm = match.eampm || "";
    if (startAmpm && !endAmpm) endAmpm = startAmpm;
    if (!startAmpm && endAmpm) startAmpm = endAmpm;
    var startHour = toHour(match.sh, startAmpm);
    var endHour = toHour(match.eh, endAmpm);
    var startMinute = Number(match.sm);
    var endMinute = Number(match.em);
    if (startHour == null || endHour == null) return null;
    if (startMinute > 59 || endMinute > 59) return null;
    if (!validDate(match.year, match.month, match.day)) return null;
    var end = { year: match.year, month: match.month, day: match.day };
    var startMins = startHour * 60 + startMinute;
    var endMins = endHour * 60 + endMinute;
    if (endMins <= startMins) end = addDays(end.year, end.month, end.day, 1);
    var raw = match.raw.replace(/\s+/g, " ").trim();
    return {
      start: stamp(match.year, match.month, match.day, startHour, startMinute),
      end: stamp(end.year, end.month, end.day, endHour, endMinute),
      label: raw,
      index: match.index
    };
  }

  function expandYear(year) {
    if (year >= 100) return year;
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  function findWindows(text) {
    var found = [];
    var named = new RegExp(
      WEEKDAY + "\\b(" + MONTH + ")\\b\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\s+" + TIME + SEP + TIME + TZ,
      "gi"
    );
    var numeric = new RegExp(
      "\\b(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})\\s+" + TIME + SEP + TIME + TZ,
      "gi"
    );
    var iso = new RegExp(
      "\\b(\\d{4})-(\\d{2})-(\\d{2})[T\\s](\\d{2}):(\\d{2})\\s*(?:-|–|—|to)\\s*(?:(\\d{4})-(\\d{2})-(\\d{2})[T\\s])?(\\d{2}):(\\d{2})" + TZ,
      "gi"
    );
    var match;
    while ((match = named.exec(text))) {
      var month = MONTHS[String(match[1] || "").toLowerCase()];
      if (!month) continue;
      var window = buildWindow({
        month: month,
        day: Number(match[2]),
        year: Number(match[3]),
        sh: match[4],
        sm: match[5],
        sampm: match[6],
        eh: match[7],
        em: match[8],
        eampm: match[9],
        raw: match[0],
        index: match.index
      });
      if (window) found.push(window);
    }
    while ((match = numeric.exec(text))) {
      var parsed = buildWindow({
        month: Number(match[1]),
        day: Number(match[2]),
        year: expandYear(Number(match[3])),
        sh: match[4],
        sm: match[5],
        sampm: match[6],
        eh: match[7],
        em: match[8],
        eampm: match[9],
        raw: match[0],
        index: match.index
      });
      if (parsed) found.push(parsed);
    }
    while ((match = iso.exec(text))) {
      var endYear = match[6] ? Number(match[6]) : Number(match[1]);
      var endMonth = match[7] ? Number(match[7]) : Number(match[2]);
      var endDay = match[8] ? Number(match[8]) : Number(match[3]);
      var startHour = Number(match[4]);
      var startMinute = Number(match[5]);
      var endHour = Number(match[9]);
      var endMinute = Number(match[10]);
      if (!validDate(Number(match[1]), Number(match[2]), Number(match[3]))) continue;
      if (!validDate(endYear, endMonth, endDay)) continue;
      if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) continue;
      var end = { year: endYear, month: endMonth, day: endDay };
      if (!match[6] && endHour * 60 + endMinute <= startHour * 60 + startMinute) {
        end = addDays(end.year, end.month, end.day, 1);
      }
      found.push({
        start: stamp(Number(match[1]), Number(match[2]), Number(match[3]), startHour, startMinute),
        end: stamp(end.year, end.month, end.day, endHour, endMinute),
        label: match[0].replace(/\s+/g, " ").trim(),
        index: match.index
      });
    }
    if (!found.length) found = findSplitWindows(text);
    return found;
  }

  function findSplitWindows(text) {
    var dates = [];
    var dateRe = new RegExp(WEEKDAY + "(" + MONTH + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})", "gi");
    var timeRe = new RegExp("\\b" + TIME + SEP + TIME + TZ, "gi");
    var match;
    while ((match = dateRe.exec(text))) {
      var month = MONTHS[match[1].toLowerCase()];
      var day = Number(match[2]);
      var year = Number(match[3]);
      if (month && validDate(year, month, day)) {
        dates.push({ year: year, month: month, day: day, index: match.index, raw: match[0] });
      }
    }
    var found = [];
    while ((match = timeRe.exec(text))) {
      var nearest = null;
      for (var i = 0; i < dates.length; i += 1) {
        var distance = match.index - dates[i].index;
        if (distance < 0 || distance > 80) continue;
        if (!nearest || distance < nearest.distance) nearest = { distance: distance, date: dates[i] };
      }
      if (!nearest) continue;
      var window = buildWindow({
        year: nearest.date.year,
        month: nearest.date.month,
        day: nearest.date.day,
        sh: match[1],
        sm: match[2],
        sampm: match[3],
        eh: match[4],
        em: match[5],
        eampm: match[6],
        raw: (nearest.date.raw + " " + match[0]).replace(/\s+/g, " ").trim(),
        index: nearest.date.index
      });
      if (window) found.push(window);
    }
    return found;
  }

  function findLabels(text) {
    var labels = [];
    var re = /(?:^|\n)\s*(?:facility|location|address|garage|lot)\s*[:\-]\s*([^\n]+)/gi;
    var match;
    while ((match = re.exec(text))) {
      var label = match[1].replace(/\s+/g, " ").trim();
      if (!label || label.indexOf("@") !== -1 || label.length > 180) continue;
      labels.push({
        label: label,
        index: match.index + match[0].indexOf(match[1])
      });
    }
    return labels;
  }

  function findAddresses(text) {
    var found = [];
    var re = new RegExp(
      "(?<![:\\d])\\b(\\d{1,6})\\s+([A-Za-z0-9][A-Za-z0-9.'’\\-]*(?:\\s+[A-Za-z0-9][A-Za-z0-9.'’\\-]*){0,4})\\s+(" + SUFFIX + ")\\b(?:\\s*,\\s*([A-Za-z][A-Za-z .'-]*?),\\s*([A-Za-z]{2})\\s+(\\d{5})(?:-\\d{4})?)?",
      "gi"
    );
    var match;
    while ((match = re.exec(text))) {
      var formatted = (match[1] + " " + match[2] + " " + match[3]).replace(/\s+/g, " ").trim();
      if (match[4] && match[5] && match[6]) {
        formatted += ", " + match[4].trim() + ", " + match[5].toUpperCase() + " " + match[6];
      }
      var lineStart = text.lastIndexOf("\n", match.index) + 1;
      var lineEnd = text.indexOf("\n", match.index);
      if (lineEnd < 0) lineEnd = text.length;
      found.push({
        formatted: formatted,
        index: match.index,
        line: text.slice(lineStart, lineEnd).replace(/\s+/g, " ").trim()
      });
    }
    return found;
  }

  function addressInLabel(address, labels) {
    for (var i = 0; i < labels.length; i += 1) {
      var label = labels[i];
      if (address.index >= label.index && address.index < label.index + label.label.length) {
        return label;
      }
    }
    return null;
  }

  function chooseAddress(labels, addresses) {
    var i;
    for (i = 0; i < addresses.length; i += 1) {
      var labeled = addressInLabel(addresses[i], labels);
      if (labeled) {
        return Object.assign({}, addresses[i], { label: labeled.label, index: labeled.index });
      }
    }
    var best = null;
    var bestScore = -1;
    for (i = 0; i < addresses.length; i += 1) {
      var score = /spot|valet|only|parallel|reserved/i.test(addresses[i].line) ? 3 : 1;
      if (score > bestScore || (score === bestScore && best && addresses[i].index < best.index)) {
        best = addresses[i];
        bestScore = score;
      }
    }
    return best;
  }

  function chooseWindow(windows, addressIndex) {
    if (!windows.length) return null;
    if (addressIndex == null) return windows[0];
    var best = windows[0];
    var bestDistance = Math.abs(windows[0].index - addressIndex);
    for (var i = 1; i < windows.length; i += 1) {
      var distance = Math.abs(windows[i].index - addressIndex);
      if (distance < bestDistance) {
        best = windows[i];
        bestDistance = distance;
      }
    }
    return best;
  }

  function findRental(text) {
    var labeled = text.match(/\b(?:rental|reservation|booking|confirmation|conf|order)\s*(?:id|number|no|#)?\s*[:#]?\s*([A-Z]{0,4}-?\d{3,})\b/i);
    if (labeled) return labeled[1].toUpperCase();
    var standalone = text.match(/\b([A-Z]{1,3}-\d{4,})\b/);
    return standalone ? standalone[1].toUpperCase() : null;
  }

  function findPlate(text) {
    var match = text.match(/\b(?:license\s+plate|licence\s+plate|plate|tag)\s*[:#]?\s*([A-Z0-9]{2,8})\b/i);
    return match ? match[1].toUpperCase() : null;
  }

  function findSpot(text, chosen) {
    var scope = chosen && chosen.label ? chosen.label : chosen && chosen.line ? chosen.line : text;
    var re = /\b((?:parallel|reserved|valet|covered|uncovered|outdoor|indoor)\s+spot\s*#?\s*\d+(?:\s+only)?|spot\s*#?\s*\d+(?:\s+only)?|valet\s+only)\b/i;
    var match = scope.match(re) || text.match(re);
    return match ? match[1].replace(/\s+/g, " ").trim() : null;
  }

  function extractBooking(input) {
    var text = cleanText(input);
    var labels = findLabels(text);
    var addresses = findAddresses(text);
    var chosen = chooseAddress(labels, addresses);
    var bookingWindow = chooseWindow(findWindows(text), chosen ? chosen.index : null);
    var facilityLabel = null;
    if (chosen && chosen.label) facilityLabel = chosen.label;
    else if (labels.length) facilityLabel = labels[0].label;
    else if (chosen && chosen.line && chosen.line.length <= 140) facilityLabel = chosen.line;

    var address = chosen ? chosen.formatted : null;
    if (!address && facilityLabel && facilityLabel.length <= 80 && facilityLabel.split(/\s+/).length <= 10) {
      address = facilityLabel;
    }

    var rentalId = findRental(text);
    var plate = findPlate(text);
    var spotNote = findSpot(text, chosen);
    var confidence = "none";
    if (address && bookingWindow) confidence = "high";
    else if (address || bookingWindow) confidence = "medium";
    else if (rentalId || plate || facilityLabel) confidence = "low";

    return {
      address: address,
      facilityLabel: facilityLabel,
      spotNote: spotNote,
      rentalId: rentalId,
      plate: plate,
      start: bookingWindow ? bookingWindow.start : null,
      end: bookingWindow ? bookingWindow.end : null,
      windowLabel: bookingWindow ? bookingWindow.label : null,
      confidence: confidence
    };
  }

  return { extractBooking: extractBooking };
});
