import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config";
import { lookupGeocode, normalizeAddress } from "./libs";

export interface ResolvedPoint {
  lat: number;
  lng: number;
  label: string;
  key: string;
  source: "cache" | "nominatim";
}

interface GeocodeEntry {
  lat: number;
  lng: number;
  label?: string;
}

function readEntries(file: string): Record<string, GeocodeEntry> {
  if (!file || !fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { entries?: unknown };
    if (!parsed.entries || typeof parsed.entries !== "object") return {};
    return parsed.entries as Record<string, GeocodeEntry>;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read geocode cache ${file}: ${reason}`);
  }
}

function writeEntries(file: string, entries: Record<string, GeocodeEntry>): void {
  if (path.basename(file).includes(".example.")) {
    throw new Error(`Refusing to write learned geocodes into example file ${file}.`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = {
    source: "local-geocode-cache",
    disclaimer: "Learned geocodes. This file is gitignored. Do not commit it if the addresses are confidential.",
    entries
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
}

interface NominatimRow {
  lat: string;
  lon: string;
  display_name?: string;
}

export function createGeocoder(config: AppConfig) {
  const entries: Record<string, GeocodeEntry> = {
    ...readEntries(config.geocodeCachePath),
    ...readEntries(config.geocodeWritePath)
  };
  let lastNominatim = 0;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function nominatim(query: string): Promise<GeocodeEntry | null> {
    const wait = lastNominatim + config.nominatimMinIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatim = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `YourSpotRentedRelocationPOC/0.1 (${config.nominatimEmail || "local-dev"})`
      }
    });
    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status} while geocoding. The address was not cached.`);
    }
    const body = (await response.json()) as NominatimRow[];
    if (!Array.isArray(body) || !body.length) return null;
    const lat = Number(body[0].lat);
    const lng = Number(body[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: body[0].display_name || query };
  }

  return {
    async resolve(address: string): Promise<ResolvedPoint | null> {
      const cached = lookupGeocode(entries, address);
      if (cached) {
        return {
          lat: cached.lat,
          lng: cached.lng,
          label: cached.label || address,
          key: cached.key,
          source: "cache"
        };
      }
      if (config.geocoder !== "nominatim") return null;
      const learned = await enqueue(() => nominatim(address));
      if (!learned) return null;
      const key = normalizeAddress(address);
      entries[key] = learned;
      const persisted = readEntries(config.geocodeWritePath);
      persisted[key] = learned;
      writeEntries(config.geocodeWritePath, persisted);
      return { lat: learned.lat, lng: learned.lng, label: learned.label || address, key, source: "nominatim" };
    }
  };
}
