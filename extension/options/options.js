(function () {
  "use strict";

  var form = document.getElementById("options-form");
  var statusEl = document.getElementById("status");
  var fields = [
    "backendUrl",
    "limit",
    "debug",
    "selectorConversationRoot",
    "selectorMessageText",
    "selectorThreadTitle",
    "selectorActiveConversation"
  ];

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function fill(settings) {
    fields.forEach(function (name) {
      var input = document.getElementById(name);
      if (!input) return;
      if (input.type === "checkbox") input.checked = Boolean(settings[name]);
      else input.value = settings[name] == null ? "" : settings[name];
    });
  }

  function read() {
    var raw = {};
    fields.forEach(function (name) {
      var input = document.getElementById(name);
      raw[name] = input.type === "checkbox" ? input.checked : input.value;
    });
    return YSR.normalizeSettings(raw);
  }

  function save(settings) {
    return new Promise(function (resolve, reject) {
      chrome.storage.sync.set(settings, function () {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(settings);
      });
    });
  }

  YSR.loadSettings().then(fill);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var settings = read();
    save(settings)
      .then(function () {
        fill(settings);
        setStatus("Saved.");
      })
      .catch(function (err) {
        setStatus(err.message);
      });
  });

  document.getElementById("reset").addEventListener("click", function () {
    var settings = YSR.normalizeSettings(YSR.DEFAULT_SETTINGS);
    save(settings)
      .then(function () {
        fill(settings);
        setStatus("Defaults restored.");
      })
      .catch(function (err) {
        setStatus(err.message);
      });
  });

  document.getElementById("test").addEventListener("click", function () {
    var settings = read();
    setStatus("Contacting " + settings.backendUrl + "…");
    fetch(settings.backendUrl + "/health")
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.message || "Health check failed");
          return body;
        });
      })
      .then(function (body) {
        var mode = body.exampleData ? "example data" : "imported data";
        setStatus("Connected. " + body.facilities + " managed facilities (" + mode + "), provider " + body.availabilityProvider + ".");
      })
      .catch(function (err) {
        setStatus("Could not reach the backend. " + err.message);
      });
  });
})();
