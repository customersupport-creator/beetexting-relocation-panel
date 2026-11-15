import fs from "node:fs";
import type { Facility, FacilityCatalog } from "./types";

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readFacility(value: unknown, index: number): Facility | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const address = typeof row.address === "string" ? row.address.trim() : "";
  if (!id || !name || !address) {
    console.warn(`Skipping facility row ${index}: id, name, and address are required.`);
    return null;
  }
  return {
    id,
    name,
    address,
    lat: numberOrNull(row.lat) ?? Number.NaN,
    lng: numberOrNull(row.lng) ?? Number.NaN,
    stalls: numberOrNull(row.stalls),
    hours: typeof row.hours === "string" ? row.hours : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    managed: row.managed !== false,
    example: row.example === true
  };
}

export function loadFacilities(file: string): FacilityCatalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read facility file ${file}: ${reason}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { facilities?: unknown }).facilities)) {
    throw new Error(`Facility file ${file} must be an object with a facilities array.`);
  }
  const body = parsed as { source?: unknown; disclaimer?: unknown; facilities: unknown[] };
  const facilities = body.facilities
    .map((row, index) => readFacility(row, index))
    .filter((row): row is Facility => row != null);
  if (!facilities.length) {
    throw new Error(`Facility file ${file} did not contain any usable facilities.`);
  }
  const managed = facilities.filter((facility) => facility.managed);
  const exampleData = body.source === "example" || (managed.length > 0 && managed.every((facility) => facility.example));
  return {
    source: typeof body.source === "string" ? body.source : "unknown",
    disclaimer: typeof body.disclaimer === "string" ? body.disclaimer : "",
    exampleData,
    facilities
  };
}
