import { createRequire } from "node:module";
import type { Facility } from "./types";

const require = createRequire(__filename);

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeHit extends LatLng {
  label?: string;
  key: string;
}

interface GeoModule {
  haversineMiles(a: LatLng, b: LatLng): number;
  rankRelocations<T extends LatLng & { name?: string; managed?: boolean }>(
    origin: LatLng,
    facilities: T[],
    limit?: number
  ): Array<T & { distanceMiles: number; sameLocation: boolean }>;
}

interface AddressModule {
  normalizeAddress(input: string): string;
  lookupGeocode(entries: Record<string, { lat: number; lng: number; label?: string }>, raw: string): GeocodeHit | null;
}

const geo = require("../../extension/lib/geo.js") as GeoModule;
const address = require("../../extension/lib/address.js") as AddressModule;

export const haversineMiles = geo.haversineMiles;
export const rankRelocations = geo.rankRelocations;
export const normalizeAddress = address.normalizeAddress;
export const lookupGeocode = address.lookupGeocode;

export type RankedFacility = Facility & { distanceMiles: number; sameLocation: boolean };
