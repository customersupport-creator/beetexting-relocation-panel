(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.YSR = Object.assign(root.YSR || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Logged-in inbox at https://app.beetexting.com/messages (Angular, top-level
  // DOM, no shadow root, no inbox iframe). The URL does not change per
  // conversation. Avoid _ngcontent-* and ng-star-inserted; those are unstable.
  var DEFAULT_SETTINGS = {
    backendUrl: "http://127.0.0.1:8787",
    limit: 5,
    debug: false,
    selectorConversationRoot: "app-texting-scroller .messages-wrapper",
    selectorMessageText: ".message-block[data-id] > .message.incoming .message-text, .message-block[data-id] > .message.outgoing .message-text",
    selectorThreadTitle: "#contact-title-name",
    selectorActiveConversation: ".conversation-card.active",
    selectorContactPhone: "#contact-phone-number",
    selectorPhoneLink: "a#contact-phone-link[href^=\"tel:\"]",
    selectorContactColumn: ".column-block.contact-block"
  };

  var SELECTOR_KEYS = [
    "selectorConversationRoot",
    "selectorMessageText",
    "selectorThreadTitle",
    "selectorActiveConversation",
    "selectorContactPhone",
    "selectorPhoneLink",
    "selectorContactColumn"
  ];

  function copySettings(settings) {
    var copy = {
      backendUrl: settings.backendUrl,
      limit: settings.limit,
      debug: settings.debug
    };
    for (var i = 0; i < SELECTOR_KEYS.length; i += 1) {
      copy[SELECTOR_KEYS[i]] = settings[SELECTOR_KEYS[i]];
    }
    return copy;
  }

  function normalizeSettings(stored) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, stored || {});
    var limit = Number(merged.limit);
    if (!Number.isFinite(limit)) limit = DEFAULT_SETTINGS.limit;
    merged.limit = Math.max(1, Math.min(20, Math.floor(limit)));
    merged.backendUrl = String(merged.backendUrl || DEFAULT_SETTINGS.backendUrl).trim().replace(/\/+$/, "");
    merged.debug = merged.debug === true || merged.debug === "true";
    for (var i = 0; i < SELECTOR_KEYS.length; i += 1) {
      var key = SELECTOR_KEYS[i];
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
