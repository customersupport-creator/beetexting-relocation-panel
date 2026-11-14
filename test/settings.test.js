const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, loadSettings } = require("../extension/lib/defaults.js");

test("settings fall back to the mock-page selectors and clamp the result limit", () => {
  const settings = normalizeSettings({
    backendUrl: "http://127.0.0.1:8787/",
    limit: 99,
    debug: "true",
    selectorMessageText: "  "
  });
  assert.equal(settings.backendUrl, "http://127.0.0.1:8787");
  assert.equal(settings.limit, 20);
  assert.equal(settings.debug, true);
  assert.equal(settings.selectorMessageText, DEFAULT_SETTINGS.selectorMessageText);
  assert.equal(settings.selectorConversationRoot, DEFAULT_SETTINGS.selectorConversationRoot);
});

test("loadSettings resolves defaults when chrome.storage is missing", async () => {
  const settings = await loadSettings();
  assert.equal(settings.backendUrl, DEFAULT_SETTINGS.backendUrl);
  assert.equal(settings.limit, 5);
});
