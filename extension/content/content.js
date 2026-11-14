(function () {
  "use strict";

  var extensionOrigin = new URL(chrome.runtime.getURL("panel/panel.html")).origin;
  var settings = Object.assign({}, YSR.DEFAULT_SETTINGS);
  var lastFingerprint = "";
  var lastPayload = null;
  var panelReady = false;
  var frameReady = false;
  var rootEl = null;
  var tabEl = null;
  var scanTimer = null;

  function queryAll(root, selectorList) {
    if (!root || !selectorList) return [];
    var selectors = String(selectorList).split(",");
    var seen = new Set();
    var out = [];
    for (var i = 0; i < selectors.length; i += 1) {
      var selector = selectors[i].trim();
      if (!selector) continue;
      var nodes;
      try {
        nodes = root.querySelectorAll(selector);
      } catch (err) {
        continue;
      }
      for (var n = 0; n < nodes.length; n += 1) {
        if (seen.has(nodes[n])) continue;
        seen.add(nodes[n]);
        out.push(nodes[n]);
      }
    }
    return out;
  }

  function queryFirst(root, selectorList) {
    return queryAll(root, selectorList)[0] || null;
  }

  function textOf(nodes) {
    var parts = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var text = (nodes[i].innerText || "").replace(/\u00a0/g, " ").trim();
      if (text) parts.push(text);
    }
    return parts.join("\n");
  }

  function looksLikeBooking(text) {
    if (text.length < 6 || text.length > 1500) return false;
    if (/\b(facility|location|rental|plate|spot)\b/i.test(text)) return true;
    if (/\d/.test(text) && /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pkwy|hwy)\b/i.test(text)) return true;
    if (/\d/.test(text) && /\b(?:am|pm)\b/i.test(text)) return true;
    return false;
  }

  function isLeafish(el) {
    var children = el.children;
    for (var i = 0; i < children.length; i += 1) {
      var tag = children[i].tagName;
      if (tag !== "BR" && tag !== "SPAN" && tag !== "A" && tag !== "STRONG" && tag !== "EM" && tag !== "B" && tag !== "I" && tag !== "TIME") {
        return false;
      }
    }
    return true;
  }

  function collectCandidates(doc, skipChrome) {
    var chunks = [];
    var nodes = doc.querySelectorAll("p, li, td, pre, blockquote, dd, div, span");
    for (var i = 0; i < nodes.length && chunks.length < 200; i += 1) {
      var el = nodes[i];
      if (el.closest("#ysr-relocation-root, script, style, noscript")) continue;
      if (skipChrome && el.closest("nav, aside, [role='navigation']")) continue;
      if (!isLeafish(el)) continue;
      if (!el.getClientRects().length) continue;
      var text = (el.innerText || "").replace(/\u00a0/g, " ").trim();
      if (!looksLikeBooking(text)) continue;
      chunks.push(text);
    }
    var seen = Object.create(null);
    var unique = [];
    for (var c = 0; c < chunks.length; c += 1) {
      if (seen[chunks[c]]) continue;
      seen[chunks[c]] = true;
      unique.push(chunks[c]);
    }
    return unique;
  }

  function heuristicText(doc) {
    var main = collectCandidates(doc, true);
    var chosen = main.length ? main : collectCandidates(doc, false);
    return chosen.join("\n");
  }

  function collectText(doc) {
    var root = queryFirst(doc, settings.selectorConversationRoot);
    if (root) {
      var messages = queryAll(root, settings.selectorMessageText);
      if (messages.length) return textOf(messages);
      return (root.innerText || "").trim();
    }
    return heuristicText(doc);
  }

  function sliceText(el, max) {
    return ((el && el.innerText) || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function threadKey(doc) {
    var active = queryFirst(doc, settings.selectorActiveConversation);
    var title = queryFirst(doc, settings.selectorThreadTitle);
    return [
      location.pathname + location.search + location.hash,
      active ? active.getAttribute("data-thread-id") || sliceText(active, 80) : "",
      title ? sliceText(title, 80) : ""
    ].join("|");
  }

  function deliver() {
    if (!lastPayload) return;
    var frame = document.getElementById("ysr-relocation-frame");
    // about:blank still has the page's origin. Wait until the extension document has loaded.
    if (frameReady && frame && frame.contentWindow) {
      frame.contentWindow.postMessage(lastPayload, extensionOrigin);
    }
    try {
      chrome.runtime.sendMessage(lastPayload, function () {
        void chrome.runtime.lastError;
      });
    } catch (err) {
      // No extension page is listening yet.
    }
  }

  function scan() {
    var text = collectText(document);
    var extracted = YSR.extractBooking(text);
    var key = threadKey(document);
    var fingerprint = [key, extracted.address || "", extracted.start || "", extracted.end || ""].join("|");
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    lastPayload = {
      source: "ysr-content",
      type: "conversation",
      extracted: extracted,
      threadKey: key,
      href: location.href
    };
    deliver();
    if (settings.debug) {
      console.info("[nearby-relocation]", {
        threadKey: key,
        textLength: text.length,
        extracted: extracted,
        preview: text.slice(0, 240)
      });
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 200);
  }

  function setCollapsed(collapsed) {
    if (!rootEl || !tabEl) return;
    rootEl.classList.toggle("ysr-collapsed", collapsed);
    tabEl.textContent = collapsed ? "Nearby" : "Hide";
    tabEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
    tabEl.setAttribute("aria-label", collapsed ? "Show nearby relocation options" : "Hide nearby relocation options");
  }

  function injectPanel() {
    if (document.getElementById("ysr-relocation-root")) return;
    rootEl = document.createElement("div");
    rootEl.id = "ysr-relocation-root";
    tabEl = document.createElement("button");
    tabEl.id = "ysr-relocation-tab";
    tabEl.type = "button";
    tabEl.textContent = "Hide";
    tabEl.setAttribute("aria-expanded", "true");
    tabEl.setAttribute("aria-label", "Hide nearby relocation options");
    tabEl.addEventListener("click", function () {
      setCollapsed(!rootEl.classList.contains("ysr-collapsed"));
    });
    var frame = document.createElement("iframe");
    frame.id = "ysr-relocation-frame";
    frame.title = "Nearby relocation options";
    rootEl.appendChild(tabEl);
    rootEl.appendChild(frame);
    (document.documentElement || document.body).appendChild(rootEl);
    frame.addEventListener("load", function () {
      frameReady = true;
      deliver();
    });
    frame.src = chrome.runtime.getURL("panel/panel.html");
  }

  function onPanelMessage(event) {
    if (event.origin !== extensionOrigin) return;
    var data = event.data;
    if (!data || data.source !== "ysr-panel") return;
    if (data.type === "ready") {
      panelReady = true;
      frameReady = true;
      deliver();
    }
    if (data.type === "collapse") setCollapsed(true);
  }

  function hookHistory() {
    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      if (!original || original.__ysr) return;
      var wrapped = function () {
        var result = original.apply(this, arguments);
        scheduleScan();
        return result;
      };
      wrapped.__ysr = true;
      history[method] = wrapped;
    });
    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("hashchange", scheduleScan);
  }

  window.addEventListener("message", onPanelMessage);
  injectPanel();
  hookHistory();
  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message) return;
    if (message.type === "request-context") {
      if (!lastPayload) scan();
      sendResponse(lastPayload);
    }
  });
  YSR.loadSettings().then(function (next) {
    settings = next;
    scan();
    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  });
  chrome.storage.onChanged.addListener(function () {
    YSR.loadSettings().then(function (next) {
      settings = next;
      lastFingerprint = "";
      scheduleScan();
    });
  });
  setTimeout(function () {
    if (!panelReady && tabEl) {
      tabEl.title = "If this panel stays blank, click the extension icon to open the side panel.";
    }
  }, 3000);
})();
