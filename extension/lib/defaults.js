(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Selectors are a starting point only. Beetexting's DOM was not inspected
  // while logged in. The mock page uses the data-ysr-* hooks. On the live
  // inbox, leave these in place and rely on text heuristics until someone
  // confirms real selectors on the options page.
  var DEFAULT_SETTINGS = {
    backendUrl: "http://127.0.0.1:8787",
    limit: 5,
    debug: false,
    selectorConversationRoot: "[data-ysr-conversation]",
    selectorMessageText: "[data-ysr-message]",
    selectorThreadTitle: "[data-ysr-thread-title]",
    selectorActiveConversation: "[data-ysr-thread][aria-current='true']"
  };

  function copySettings(settings) {
    return {
      backendUrl: settings.backendUrl,
      limit: settings.limit,
      debug: settings.debug,
      selectorConversationRoot: settings.selectorConversationRoot,
      selectorMessageText: settings.selectorMessageText,
      selectorThreadTitle: settings.selectorThreadTitle,
      selectorActiveConversation: settings.selectorActiveConversation
    };
  }

  function normalizeSettings(stored) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, stored || {});
    var limit = Number(merged.limit);
    if (!Number.isFinite(limit)) limit = DEFAULT_SETTINGS.limit;
    merged.limit = Math.max(1, Math.min(20, Math.floor(limit)));
    merged.backendUrl = String(merged.backendUrl || DEFAULT_SETTINGS.backendUrl).trim().replace(/\/+$/, "");
    merged.debug = merged.debug === true || merged.debug === "true";
    var keys = ["selectorConversationRoot", "selectorMessageText", "selectorThreadTitle", "selectorActiveConversation"];
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = String(merged[key] == null ? "" : merged[key]).trim();
      merged[key] = value || DEFAULT_SETTINGS[key];
    }
    return copySettings(merged);
  }

  function loadSettings() {
    var chromeApi = globalThis.chrome;
    return new Promise(function (resolve) {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync) {
        resolve(copySettings(DEFAULT_SETTINGS));
        return;
      }
      chromeApi.storage.sync.get(copySettings(DEFAULT_SETTINGS), function (stored) {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          resolve(copySettings(DEFAULT_SETTINGS));
          return;
        }
        resolve(normalizeSettings(stored));
      });
    });
  }

  return {
    DEFAULT_SETTINGS: Object.freeze(DEFAULT_SETTINGS),
    normalizeSettings: normalizeSettings,
    loadSettings: loadSettings
  };
});
