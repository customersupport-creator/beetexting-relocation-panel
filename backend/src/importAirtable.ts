import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mapAirtableRecord, type AirtableFieldMap, type AirtableRecord } from "./airtableMap";
import { loadConfig } from "./config";
import { loadEnvFile } from "./env";
import { createGeocoder } from "./geocode";
import { REPO_ROOT } from "./paths";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() || "";
  if (!value) {
    throw new Error(`Set ${name} in .env (see .env.example). No request was sent.`);
  }
  return value;
}

function assertGitignored(file: string): void {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", file], { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    throw new Error(
      `Refusing to write ${file} because it is not gitignored. Real facility data must stay out of this public repo.`
    );
  }
}

function fieldMap(): AirtableFieldMap {
  return {
    name: process.env.AIRTABLE_FIELD_NAME || "Name",
    address: process.env.AIRTABLE_FIELD_ADDRESS || "Address",
    lat: process.env.AIRTABLE_FIELD_LAT || "Latitude",
    lng: process.env.AIRTABLE_FIELD_LNG || "Longitude",
    stalls: process.env.AIRTABLE_FIELD_STALLS || "Stalls",
    hours: process.env.AIRTABLE_FIELD_HOURS || "Hours",
    notes: process.env.AIRTABLE_FIELD_NOTES || "Notes",
    managed: process.env.AIRTABLE_FIELD_MANAGED || "Managed"
  };
}

async function fetchAll(baseId: string, table: string, view: string, token: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (view) url.searchParams.set("view", view);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500).replaceAll(token, "[redacted]");
      throw new Error(`Airtable returned ${response.status}. ${text}`);
    }
    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    records.push(...(body.records || []));
    offset = body.offset || "";
  } while (offset);
  return records;
}

async function main(): Promise<void> {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  const token = requiredEnv("AIRTABLE_TOKEN");
  const baseId = requiredEnv("AIRTABLE_BASE_ID");
  if (!/^app[A-Za-z0-9]+$/.test(baseId)) {
    throw new Error("AIRTABLE_BASE_ID should look like appXXXXXXXX. The token stays in the header, not the URL.");
  }
  const table = requiredEnv("AIRTABLE_TABLE");
  if (/[\\/]/.test(table)) throw new Error("AIRTABLE_TABLE must be a single table name or table id.");
  const view = process.env.AIRTABLE_VIEW?.trim() || "";
  const output = path.resolve(REPO_ROOT, process.env.IMPORT_OUTPUT || "backend/data/facilities.json");
  if (path.basename(output).includes(".example.")) {
    throw new Error("Refusing to overwrite an example data file.");
  }
  assertGitignored(output);

  const records = await fetchAll(baseId, table, view, token);
  const fields = fieldMap();
  const mapped = [];
  let unmanaged = 0;
  let invalid = 0;
  for (const record of records) {
    const result = mapAirtableRecord(record, fields);
    if (result === "skip-unmanaged") {
      unmanaged += 1;
      continue;
    }
    if (result === "skip-invalid") {
      invalid += 1;
      continue;
    }
    mapped.push(result);
  }

  const geocoder = createGeocoder(loadConfig());
  const facilities = [];
  const missing: string[] = [];
  let geocoded = 0;
  for (const item of mapped) {
    let lat = item.lat;
    let lng = item.lng;
    if (lat == null || lng == null) {
      const point = await geocoder.resolve(item.address);
      if (!point) {
        missing.push(item.address);
        continue;
      }
      lat = point.lat;
      lng = point.lng;
      geocoded += 1;
    }
    facilities.push({ ...item, lat, lng });
  }

  const document = {
    source: "airtable",
    importedAt: new Date().toISOString(),
    disclaimer: "Imported facility data. May be confidential. This path is gitignored — do not commit it.",
    facilities
  };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(document, null, 2) + "\n");
  }
  console.log(`${dryRun ? "Dry run." : "Wrote"} ${facilities.length} facilities${dryRun ? "" : ` to ${path.relative(REPO_ROOT, output)}`}`);
  console.log(`Skipped ${unmanaged} unmanaged, ${invalid} invalid, ${missing.length} without coordinates. Geocoded ${geocoded}.`);
  if (missing.length) {
    console.log("No coordinates for:");
    for (const address of missing) console.log(`- ${address}`);
  }
  console.log("Restart the backend so it reloads the file. Keep FACILITIES_PATH pointed at the import output.");
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message.replaceAll(process.env.AIRTABLE_TOKEN || "\u0000", "[redacted]"));
    process.exit(1);
  });
}
