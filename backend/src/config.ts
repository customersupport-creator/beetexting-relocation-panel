import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths";

export interface AppConfig {
  host: string;
  port: number;
  facilitiesPath: string;
  geocodeCachePath: string;
  geocodeWritePath: string;
  geocoder: "cache" | "nominatim";
  nominatimEmail: string;
  nominatimMinIntervalMs: number;
  availabilityProvider: string;
  nearbyLimit: number;
}

function existingPath(value: string | undefined, fallback: string): string {
  const raw = value && value.trim() ? value.trim() : fallback;
  if (path.isAbsolute(raw)) return raw;
  const fromCwd = path.resolve(process.cwd(), raw);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(REPO_ROOT, raw);
}

export function availabilityTtlMs(): number {
  const n = Number(process.env.AVAILABILITY_TTL_MS ?? 30_000);
  if (!Number.isFinite(n) || n < 0) return 30_000;
  return n;
}

export function loadConfig(): AppConfig {
  const geocoder = (process.env.GEOCODER || "cache").toLowerCase();
  if (geocoder !== "cache" && geocoder !== "nominatim") {
    throw new Error('GEOCODER must be "cache" or "nominatim".');
  }
  const port = Number(process.env.PORT || 8787);
  const limit = Number(process.env.NEARBY_LIMIT || 5);
  const interval = Number(process.env.NOMINATIM_MIN_INTERVAL_MS || 1100);
  return {
    host: process.env.HOST || "127.0.0.1",
    port: Number.isFinite(port) ? port : 8787,
    facilitiesPath: existingPath(process.env.FACILITIES_PATH, "backend/data/facilities.example.json"),
    geocodeCachePath: existingPath(process.env.GEOCODE_CACHE_PATH, "backend/data/geocode-cache.example.json"),
    geocodeWritePath: existingPath(process.env.GEOCODE_WRITE_PATH, "backend/data/geocode-cache.json"),
    geocoder,
    nominatimEmail: process.env.NOMINATIM_EMAIL || "",
    nominatimMinIntervalMs: Number.isFinite(interval) && interval >= 0 ? interval : 1100,
    availabilityProvider: process.env.AVAILABILITY_PROVIDER || "mock",
    nearbyLimit: Number.isFinite(limit) ? limit : 5
  };
}
