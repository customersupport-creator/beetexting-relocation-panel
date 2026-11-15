export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface AirtableFieldMap {
  name: string;
  address: string;
  lat: string;
  lng: string;
  stalls: string;
  hours: string;
  notes: string;
  managed: string;
}

export interface MappedFacility {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  stalls: number | null;
  hours: string;
  notes: string;
  managed: true;
  example: false;
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean).join(", ");
  return "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "managed", "x"].includes(text)) return true;
    if (["false", "no", "n", "0", "unmanaged"].includes(text)) return false;
  }
  return null;
}

export function mapAirtableRecord(
  record: AirtableRecord,
  fields: AirtableFieldMap
): MappedFacility | "skip-unmanaged" | "skip-invalid" {
  if (!record || typeof record.id !== "string" || !record.id || !record.fields) return "skip-invalid";
  const name = asString(record.fields[fields.name]);
  const address = asString(record.fields[fields.address]);
  if (!name || !address) return "skip-invalid";
  const managedRaw = record.fields[fields.managed];
  if (managedRaw != null && managedRaw !== "") {
    const managed = asBool(managedRaw);
    if (managed === false) return "skip-unmanaged";
    if (managed == null) return "skip-invalid";
  }
  return {
    id: `airtable:${record.id}`,
    name,
    address,
    lat: asNumber(record.fields[fields.lat]),
    lng: asNumber(record.fields[fields.lng]),
    stalls: asNumber(record.fields[fields.stalls]),
    hours: asString(record.fields[fields.hours]),
    notes: asString(record.fields[fields.notes]),
    managed: true,
    example: false
  };
}
