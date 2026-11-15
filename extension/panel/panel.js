(function () {
  "use strict";

  var embedded = window.parent !== window;
  var settings = Object.assign({}, YSR.DEFAULT_SETTINGS);
  var currentExtraction = null;
  var appliedThread = null;
  var lastFingerprint = "";
  var edited = false;
  var filling = false;
  var searchSeq = 0;
  var eventSource = null;
  var availabilityById = {};

  var banner = document.getElementById("banner");
  var form = document.getElementById("search-form");
  var addressInput = document.getElementById("address");
  var startInput = document.getElementById("start");
  var endInput = document.getElementById("end");
  var useDetected = document.getElementById("use-detected");
  var meta = document.getElementById("meta");
  var statusEl = document.getElementById("status");
  var resultsEl = document.getElementById("results");
  var healthEl = document.getElementById("health");
  var collapseBtn = document.getElementById("collapse");
  var optionsBtn = document.getElementById("options");

  if (embedded) document.body.classList.add("embedded");

  function parentOrigin() {
    try {
      return new URL(document.referrer).origin;
    } catch (err) {
      return "*";
    }
  }

  function originAllowed(origin) {
    return (
      origin === "https://app.beetexting.com" ||
      origin === "http://127.0.0.1:4173" ||
      origin === "http://localhost:4173"
    );
  }

  function backendBase() {
    return String(settings.backendUrl || YSR.DEFAULT_SETTINGS.backendUrl).replace(/\/+$/, "");
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function setBanner(text) {
    if (!text) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    banner.hidden = false;
    banner.textContent = text;
  }

  function setHealth(text, ok) {
    healthEl.textContent = text;
    healthEl.className = ok ? "ok" : "bad";
  }

  function closeStream() {
    if (!eventSource) return;
    eventSource.__ysrClosed = true;
    eventSource.close();
    eventSource = null;
  }

  function showMeta(extracted) {
    if (!extracted) {
      meta.textContent = "";
      return;
    }
    var parts = [];
    if (extracted.confidence && extracted.confidence !== "none") parts.push(extracted.confidence + " confidence");
    if (extracted.windowLabel) parts.push(extracted.windowLabel);
    if (extracted.spotNote) parts.push(extracted.spotNote);
    if (extracted.rentalId) parts.push("Rental " + extracted.rentalId);
    if (extracted.plate) parts.push("Plate " + extracted.plate);
    meta.textContent = parts.join(" · ");
  }

  function fillForm(extracted) {
    filling = true;
    addressInput.value = extracted.address || "";
    startInput.value = extracted.start || "";
    endInput.value = extracted.end || "";
    filling = false;
  }

  function showUseDetected(extracted) {
    if (!extracted || !extracted.address) {
      useDetected.hidden = true;
      return;
    }
    useDetected.hidden = false;
    useDetected.textContent = "Use detected: " + extracted.address;
  }

  function fingerprint(message) {
    var extracted = (message && message.extracted) || {};
    return [message.threadKey || "", extracted.address || "", extracted.start || "", extracted.end || ""].join("|");
  }

  function applyConversation(message) {
    var extracted = message.extracted || {};
    var fp = fingerprint(message);
    if (fp === lastFingerprint) return;
    var threadChanged = message.threadKey !== appliedThread;
    currentExtraction = extracted;
    showMeta(extracted);
    if (!threadChanged && edited) {
      lastFingerprint = fp;
      showUseDetected(extracted);
      return;
    }
    lastFingerprint = fp;
    appliedThread = message.threadKey || "";
    edited = false;
    useDetected.hidden = true;
    fillForm(extracted);
    if (extracted.address) search();
    else {
      closeStream();
      resultsEl.replaceChildren();
      setStatus("No booking detected in this conversation. Enter an address to search.");
    }
  }

  function windowLabelForMessage() {
    if (
      currentExtraction &&
      currentExtraction.windowLabel &&
      startInput.value === (currentExtraction.start || "") &&
      endInput.value === (currentExtraction.end || "")
    ) {
      return currentExtraction.windowLabel;
    }
    if (startInput.value && endInput.value) {
      return startInput.value.replace("T", " ") + " – " + endInput.value.replace("T", " ");
    }
    return "";
  }

  function originalFacility() {
    if (currentExtraction && currentExtraction.facilityLabel && !edited) return currentExtraction.facilityLabel;
    return addressInput.value.trim();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      var area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  function stallText(availability) {
    if (!availability) return "Checking availability…";
    if (availability.status === "unavailable") return "No stalls reported open";
    if (typeof availability.stallsAvailable === "number") {
      var noun = availability.stallsAvailable === 1 ? "stall" : "stalls";
      if (availability.status === "limited") return availability.stallsAvailable + " " + noun + " left";
      return availability.stallsAvailable + " " + noun + " open";
    }
    return "Availability unknown";
  }

  function renderCard(facility, primary) {
    var card = document.createElement("li");
    card.className = "card" + (primary ? " primary" : "") + (facility.sameLocation ? " same" : "");
    card.id = "ysr-card-" + facility.id;

    if (facility.sameLocation) {
      var badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = "Same location as the booking";
      card.appendChild(badge);
    }

    var top = document.createElement("div");
    top.className = "card-top";
    var distance = document.createElement("div");
    distance.className = "distance";
    distance.textContent = YSR.formatMiles(facility.distanceMiles);
    top.appendChild(distance);
    card.appendChild(top);

    var name = document.createElement("h2");
    name.className = "name";
    name.textContent = facility.name;
    card.appendChild(name);

    var address = document.createElement("p");
    address.className = "address";
    address.textContent = facility.address;
    card.appendChild(address);

    if (facility.hours) {
      var hours = document.createElement("p");
      hours.className = "hours";
      hours.textContent = "Hours " + facility.hours;
      card.appendChild(hours);
    }

    var stalls = document.createElement("p");
    stalls.className = "stalls pending";
    stalls.id = "ysr-stalls-" + facility.id;
    stalls.textContent = stallText(null);
    card.appendChild(stalls);

    if (facility.notes) {
      var notes = document.createElement("p");
      notes.className = "notes";
      notes.textContent = facility.notes;
      card.appendChild(notes);
    }

    var actions = document.createElement("div");
    actions.className = "card-actions";
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy" + (primary ? "" : " secondary");
    copy.textContent = facility.sameLocation ? "Copy anyway" : "Copy message";
    copy.addEventListener("click", function () {
      var text = YSR.customerMessage({
        originalFacility: originalFacility(),
        facility: facility,
        distanceMiles: facility.distanceMiles,
        windowLabel: windowLabelForMessage(),
        availability: availabilityById[facility.id] || null
      });
      copyText(text).then(function (ok) {
        copy.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(function () {
          copy.textContent = facility.sameLocation ? "Copy anyway" : "Copy message";
        }, 1200);
      });
    });
    actions.appendChild(copy);
    card.appendChild(actions);
    return card;
  }

  function renderResults(payload) {
    availabilityById = {};
    resultsEl.replaceChildren();
    var primarySet = false;
    (payload.results || []).forEach(function (facility) {
      var primary = !primarySet && !facility.sameLocation;
      if (primary) primarySet = true;
      resultsEl.appendChild(renderCard(facility, primary));
    });
  }

  function updateAvailability(id, availability) {
    availabilityById[id] = availability;
    var stalls = document.getElementById("ysr-stalls-" + id);
    if (!stalls) return;
    stalls.textContent = stallText(availability);
    stalls.className = "stalls " + (availability.status || "unknown");
  }

  async function readJson(response) {
    var text = await response.text();
    var body = null;
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = { message: text.slice(0, 180) || "The backend returned an unreadable response." };
    }
    if (!response.ok) {
      var error = new Error(body.message || body.error || "Request failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function finishAvailability(seq, count) {
    if (seq !== searchSeq) return;
    setStatus(count + " nearby " + (count === 1 ? "facility" : "facilities") + ". Availability updated.");
  }

  function fetchAvailabilityJson(seq, ids, start, end) {
    var params = new URLSearchParams();
    params.set("ids", ids.join(","));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    fetch(backendBase() + "/availability?" + params.toString())
      .then(readJson)
      .then(function (body) {
        if (seq !== searchSeq) return;
        ids.forEach(function (id) {
          if (body.results && body.results[id]) updateAvailability(id, body.results[id]);
        });
        finishAvailability(seq, ids.length);
      })
      .catch(function () {
        if (seq !== searchSeq) return;
        setStatus("Nearest facilities are shown. Availability could not be checked.");
      });
  }

  function streamAvailability(seq, ids, start, end) {
    closeStream();
    var params = new URLSearchParams();
    params.set("ids", ids.join(","));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    var gotEvent = false;
    var source;
    try {
      source = new EventSource(backendBase() + "/availability/stream?" + params.toString());
    } catch (err) {
      fetchAvailabilityJson(seq, ids, start, end);
      return;
    }
    eventSource = source;
    source.addEventListener("availability", function (event) {
      if (seq !== searchSeq) return;
      gotEvent = true;
      var data = JSON.parse(event.data);
      updateAvailability(data.id, data);
      var done = ids.every(function (id) { return availabilityById[id]; });
      if (!done) {
        var ready = Object.keys(availabilityById).length;
        setStatus("Nearest facilities shown. Availability " + ready + " of " + ids.length + "…");
      }
    });
    source.addEventListener("done", function () {
      source.__ysrClosed = true;
      source.close();
      if (eventSource === source) eventSource = null;
      finishAvailability(seq, ids.length);
    });
    source.onerror = function () {
      if (source.__ysrClosed || seq !== searchSeq) return;
      source.close();
      if (eventSource === source) eventSource = null;
      if (!gotEvent) fetchAvailabilityJson(seq, ids, start, end);
      else setStatus("Nearest facilities are shown. Availability updates stopped early.");
    };
  }

  function search() {
    var address = addressInput.value.trim();
    var seq = ++searchSeq;
    closeStream();
    availabilityById = {};
    if (!address) {
      resultsEl.replaceChildren();
      setStatus("Enter a facility address.");
      return;
    }
    setStatus("Finding nearby facilities…");
    var params = new URLSearchParams();
    params.set("address", address);
    params.set("limit", String(settings.limit || 5));
    if (startInput.value) params.set("start", startInput.value);
    if (endInput.value) params.set("end", endInput.value);
    fetch(backendBase() + "/nearby?" + params.toString())
      .then(readJson)
      .then(function (body) {
        if (seq !== searchSeq) return;
        if (body.exampleData) setBanner("Sample facilities for this proof of concept — not live inventory.");
        renderResults(body);
        var ids = (body.results || []).map(function (facility) { return facility.id; });
        if (!ids.length) {
          setStatus("No managed facilities to show.");
          return;
        }
        setStatus("Nearest " + ids.length + " shown. Checking availability…");
        streamAvailability(seq, ids, startInput.value, endInput.value);
      })
      .catch(function (err) {
        if (seq !== searchSeq) return;
        resultsEl.replaceChildren();
        setStatus(err.message || "The search failed.");
      });
  }

  function ping() {
    fetch(backendBase() + "/health")
      .then(readJson)
      .then(function (body) {
        var label = body.exampleData ? "Sample backend connected" : "Backend connected";
        setHealth(label + " · " + body.facilities + " facilities", true);
        if (body.exampleData) setBanner("Sample facilities for this proof of concept — not live inventory.");
      })
      .catch(function () {
        setHealth("Backend offline", false);
        setBanner("Can't reach " + backendBase() + ". Start it with npm start, or change the URL in Options.");
      });
  }

  function onParentMessage(event) {
    var data = event.data;
    if (!data || data.source !== "ysr-content" || data.type !== "conversation") return;
    if (!originAllowed(event.origin)) return;
    applyConversation(data);
  }

  function requestActiveTab() {
    if (!chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "request-context" }, function (response) {
        if (chrome.runtime.lastError || !response) return;
        applyConversation(response);
      });
    });
  }

  [addressInput, startInput, endInput].forEach(function (input) {
    input.addEventListener("input", function () {
      if (!filling) edited = true;
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    search();
  });

  useDetected.addEventListener("click", function () {
    if (!currentExtraction) return;
    edited = false;
    useDetected.hidden = true;
    fillForm(currentExtraction);
    if (currentExtraction.address) search();
  });

  collapseBtn.addEventListener("click", function () {
    if (!embedded) return;
    window.parent.postMessage({ source: "ysr-panel", type: "collapse" }, parentOrigin());
  });

  optionsBtn.addEventListener("click", function () {
    if (chrome.runtime && chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  window.addEventListener("error", function (event) {
    setStatus("Panel error: " + event.message);
  });

  YSR.loadSettings().then(function (next) {
    settings = next;
    ping();
    if (embedded) {
      window.addEventListener("message", onParentMessage);
      window.parent.postMessage({ source: "ysr-panel", type: "ready" }, parentOrigin());
    } else if (chrome.runtime && chrome.tabs) {
      chrome.runtime.onMessage.addListener(function (message, sender) {
        if (!message || message.type !== "conversation" || !sender.tab) return;
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id === sender.tab.id) applyConversation(message);
        });
      });
      if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(requestActiveTab);
      requestActiveTab();
      setStatus("Open a Beetexting conversation, or enter an address here. The in-page panel reads the thread automatically.");
    }
  });
})();
