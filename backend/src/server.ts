import http from "node:http";
import type { AddressInfo } from "node:net";
import { checkFacilities, createAvailabilityProvider } from "./availability";
import { availabilityTtlMs, loadConfig, type AppConfig } from "./config";
import { loadFacilities } from "./facilities";
import { createGeocoder } from "./geocode";
import { normalizeAddress, rankRelocations } from "./libs";
import type { AvailabilityResult, Facility } from "./types";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export interface StartOptions {
  port?: number;
  host?: string;
  quiet?: boolean;
  config?: AppConfig;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

interface NearbyQuery {
  address: string;
  start?: string;
  end?: string;
  limit: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cleanTime(value: string, field: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(trimmed);
  if (!match) throw new HttpError(400, "invalid_time", `${field} must look like 2026-11-14T17:30.`);
  return match[1];
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  const chosen = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(1, Math.min(20, Math.floor(chosen)));
}

function applyCapacity(result: AvailabilityResult, facility: Facility | undefined): AvailabilityResult {
  if (!facility || facility.stalls == null || result.stallsAvailable == null) return result;
  const stallsAvailable = Math.min(result.stallsAvailable, facility.stalls);
  let status = result.status;
  if (stallsAvailable <= 0) status = "unavailable";
  else if (stallsAvailable < 5 && status === "available") status = "limited";
  return { ...result, stallsAvailable, status };
}

function parseIds(value: string | null): string[] {
  const ids = (value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const unique = [...new Set(ids)].slice(0, 20);
  for (const id of unique) {
    if (!/^[\w:-]{1,80}$/.test(id)) {
      throw new HttpError(400, "invalid_id", "Facility ids contain unexpected characters.");
    }
  }
  return unique;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  log: { quiet: boolean; started: number; method: string; pathname: string }
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
  if (!log.quiet) {
    console.log(`${log.method} ${log.pathname} ${status} ${Date.now() - log.started}ms`);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 100_000) {
        settled = true;
        reject(new HttpError(413, "body_too_large", "Request body is too large."));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (!settled) reject(err);
    });
  });
}

export async function startServer(options: StartOptions = {}): Promise<RunningServer> {
  const config = options.config ?? loadConfig();
  const catalog = loadFacilities(config.facilitiesPath);
  const geocoder = createGeocoder(config);
  const provider = createAvailabilityProvider(config.availabilityProvider);
  const quiet = options.quiet === true;
  const facilityById = new Map(catalog.facilities.map((facility) => [facility.id, facility]));

  async function readNearbyQuery(req: http.IncomingMessage, url: URL): Promise<NearbyQuery> {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      const raw = await readBody(req);
      if (raw.trim()) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
          body = parsed as Record<string, unknown>;
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(400, "invalid_json", "POST body must be a JSON object.");
        }
      }
    }
    const address = stringField(body.address) || url.searchParams.get("address")?.trim() || "";
    if (!address) throw new HttpError(400, "missing_address", "Add an address to search.");
    return {
      address,
      start: cleanTime(stringField(body.start) || url.searchParams.get("start") || "", "start"),
      end: cleanTime(stringField(body.end) || url.searchParams.get("end") || "", "end"),
      limit: clampLimit(body.limit ?? url.searchParams.get("limit"), config.nearbyLimit)
    };
  }

  async function nearbyPayload(query: NearbyQuery) {
    const started = Date.now();
    const point = await geocoder.resolve(query.address);
    if (!point) {
      throw new HttpError(
        422,
        "unknown_address",
        "No coordinates for that address. Add it to the geocode cache, or set GEOCODER=nominatim for a one-time lookup.",
        { normalized: normalizeAddress(query.address) }
      );
    }
    const ranked = rankRelocations(point, catalog.facilities, query.limit);
    return {
      query: {
        address: query.address,
        resolvedAddress: point.label,
        lat: point.lat,
        lng: point.lng,
        start: query.start || null,
        end: query.end || null
      },
      exampleData: catalog.exampleData,
      disclaimer: catalog.disclaimer,
      availability: "pending",
      tookMs: Date.now() - started,
      results: ranked.map((facility) => ({
        id: facility.id,
        name: facility.name,
        address: facility.address,
        lat: facility.lat,
        lng: facility.lng,
        distanceMiles: round3(facility.distanceMiles),
        hours: facility.hours,
        notes: facility.notes,
        stallsTotal: facility.stalls,
        managed: facility.managed,
        example: facility.example,
        sameLocation: facility.sameLocation,
        availability: null
      }))
    };
  }

  function availabilityRequests(ids: string[], start: string | undefined, end: string | undefined) {
    return ids.map((facilityId) => ({ facilityId, start, end }));
  }

  function shapeAvailability(facilityId: string, result: AvailabilityResult) {
    const shaped = applyCapacity(result, facilityById.get(facilityId));
    return { id: facilityId, ...shaped };
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const started = Date.now();
    const method = req.method || "GET";
    let pathname = "/";
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      pathname = url.pathname.replace(/\/+$/, "") || "/";
      const log = { quiet, started, method, pathname };
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600"
        });
        res.end();
        return;
      }
      if (method === "GET" && pathname === "/health") {
        const managed = catalog.facilities.filter((facility) => facility.managed).length;
        sendJson(res, 200, {
          ok: true,
          facilities: managed,
          exampleData: catalog.exampleData,
          availabilityProvider: provider.name,
          geocoder: config.geocoder
        }, log);
        return;
      }
      if ((method === "GET" || method === "POST") && (pathname === "/nearby" || pathname === "/api/nearby")) {
        const query = await readNearbyQuery(req, url);
        sendJson(res, 200, await nearbyPayload(query), log);
        return;
      }
      if (method === "GET" && (pathname === "/availability" || pathname === "/api/availability" || pathname === "/availability/stream" || pathname === "/api/availability/stream")) {
        const ids = parseIds(url.searchParams.get("ids"));
        if (!ids.length) throw new HttpError(400, "missing_ids", "Pass ids for the facilities to check.");
        const start = cleanTime(url.searchParams.get("start") || "", "start");
        const end = cleanTime(url.searchParams.get("end") || "", "end");
        const requests = availabilityRequests(ids, start, end);
        const streaming = pathname.endsWith("/stream");
        if (!streaming) {
          const results = await checkFacilities(provider, requests, availabilityTtlMs());
          const shaped: Record<string, AvailabilityResult & { id: string }> = {};
          for (const id of ids) {
            const result = results[id] || {
              status: "unknown" as const,
              stallsAvailable: null,
              note: facilityById.has(id) ? "Availability did not return a result." : "Unknown facility."
            };
            shaped[id] = shapeAvailability(id, result);
          }
          sendJson(res, 200, { provider: provider.name, results: shaped }, log);
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no"
        });
        let closed = false;
        req.on("close", () => {
          closed = true;
        });
        await checkFacilities(provider, requests, availabilityTtlMs(), (id, result) => {
          if (closed) return;
          res.write(`event: availability\ndata: ${JSON.stringify(shapeAvailability(id, result))}\n\n`);
        });
        if (!closed) {
          res.write("event: done\ndata: {}\n\n");
          res.end();
        }
        if (!quiet) console.log(`${method} ${pathname} 200 ${Date.now() - started}ms`);
        return;
      }
      sendJson(res, 404, { error: "not_found", message: "No route for that path." }, log);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const log = { quiet, started, method, pathname };
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code, message: err.message, ...err.extra }, log);
        return;
      }
      console.error(err);
      sendJson(res, 500, { error: "internal_error", message: "The nearby search failed." }, log);
    }
  }

  const host = options.host || config.host;
  const port = options.port ?? config.port;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  if (!quiet) {
    console.log(`Nearby relocation backend listening on http://${host}:${address.port}`);
    console.log(`Facilities: ${catalog.facilities.filter((facility) => facility.managed).length} managed (${catalog.exampleData ? "example data" : catalog.source})`);
    console.log(`Availability provider: ${provider.name}`);
  }
  return {
    server,
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
