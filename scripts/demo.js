const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const children = [];

function run(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (code) shutdown(code);
  });
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code || 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run(["--import", "tsx", "backend/src/main.ts"]);
run(["mock/serve.js"]);
