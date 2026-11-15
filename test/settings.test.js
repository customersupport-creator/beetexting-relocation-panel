const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, loadSettings } = require("../extension/lib/defaults.js");

test("defaults match the logged-in Beetexting inbox", () => {
  assert.equal(DEFAULT_SETTINGS.selectorConversationRoot, "app-texting-scroller .messages-wrapper");
  assert.match(DEFAULT_SETTINGS.selectorMessageText, /\.message-block\[data-id\]/);
  assert.match(DEFAULT_SETTINGS.selectorMessageText, /\.message-text/);
  assert.equal(DEFAULT_SETTINGS.selectorThreadTitle, "#contact-title-name");
  assert.equal(DEFAULT_SETTINGS.selectorActiveConversation, ".conversation-card.active");
  assert.equal(DEFAULT_SETTINGS.selectorContactPhone, "#contact-phone-number");
  assert.match(DEFAULT_SETTINGS.selectorPhoneLink, /#contact-phone-link/);
  assert.equal(DEFAULT_SETTINGS.selectorContactColumn, ".column-block.contact-block");
});

test("blank selectors fall back to the inbox defaults and the result limit is clamped", () => {
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
