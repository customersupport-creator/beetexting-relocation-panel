import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Branded Google Chrome ignores --load-extension. Point CHROME_PATH at a
// Chromium build when you need this script. The demo servers must already
// be running (npm run demo).
const extension = path.resolve("extension");
const outDir = process.env.SCREENSHOT_DIR || "docs";
const out = path.join(outDir, "panel-on-mock-page.png");
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
  args: [
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--window-size=1440,920",
    "--window-position=20,20",
    `--user-data-dir=${path.resolve(".tmp/chrome-profile")}`
  ]
});

async function panelFrame(page) {
  await page.waitForSelector("#ysr-relocation-frame", { timeout: 8000 });
  return page.waitForFrame((candidate) => candidate.url().includes("panel.html"), { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle0", timeout: 20000 });
  const frame = await panelFrame(page);
  await frame.waitForFunction(() => document.body.innerText.includes("Park Plaza"), { timeout: 8000 });
  await frame.waitForFunction(() => /stalls? open|stalls? left|No stalls/i.test(document.body.innerText), { timeout: 8000 });
  const address = await frame.$eval("#address", (el) => el.value);
  if (!address.includes("406 Beacon")) throw new Error(`Expected Beacon address, got ${address}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await page.screenshot({ path: out });

  await page.click('[data-thread-id="sam"]');
  await frame.waitForFunction(() => {
    const input = document.querySelector("#address");
    return input && input.value.includes("75 State");
  }, { timeout: 8000 });

  const heuristic = await browser.newPage();
  await heuristic.goto("http://127.0.0.1:4173/heuristic.html", { waitUntil: "networkidle0", timeout: 20000 });
  const heuristicFrame = await panelFrame(heuristic);
  await heuristicFrame.waitForFunction(() => {
    const input = document.querySelector("#address");
    return input && input.value.includes("406 Beacon");
  }, { timeout: 8000 });
  const heuristicAddress = await heuristicFrame.$eval("#address", (el) => el.value);
  if (/Memorial/i.test(heuristicAddress)) {
    throw new Error(`Heuristic page used the aside address: ${heuristicAddress}`);
  }
  if (consoleErrors.some((line) => /postMessage/.test(line))) {
    throw new Error(`postMessage errors:\n${consoleErrors.join("\n")}`);
  }
  console.log("Wrote", out);
} finally {
  await browser.close();
}
