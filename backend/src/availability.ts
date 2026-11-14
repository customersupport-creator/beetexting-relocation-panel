import type { AvailabilityProvider, AvailabilityRequest, AvailabilityResult, AvailabilityStatus } from "./types";

const MOCK_NOTE = "Mock availability for the proof of concept. Not a live SpotHero result.";

const cache = new Map<string, { expires: number; value: AvailabilityResult }>();

export function clearAvailabilityCache(): void {
  cache.clear();
}

export function availabilityDelayMs(): number {
  const n = Number(process.env.AVAILABILITY_DELAY_MS ?? 120);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mockStatus(stallsAvailable: number): AvailabilityStatus {
  if (stallsAvailable <= 0) return "unavailable";
  if (stallsAvailable < 5) return "limited";
  return "available";
}

class MockAvailabilityProvider implements AvailabilityProvider {
  readonly name = "mock";

  async check(request: AvailabilityRequest): Promise<AvailabilityResult> {
    const bucket = (request.start || "").slice(0, 13);
    const hash = hashString(`${request.facilityId}|${bucket}`);
    const baseDelay = availabilityDelayMs();
    const wait = baseDelay === 0 ? 0 : baseDelay + (hash % 160);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const roll = hash % 100;
    const stallsAvailable = roll < 12 ? 0 : roll < 30 ? (roll % 4) + 1 : (roll % 25) + 5;
    return {
      status: mockStatus(stallsAvailable),
      stallsAvailable,
      note: MOCK_NOTE,
      checkedAt: new Date().toISOString()
    };
  }
}

export function createAvailabilityProvider(name?: string): AvailabilityProvider {
  const kind = (name || process.env.AVAILABILITY_PROVIDER || "mock").toLowerCase();
  if (kind === "mock") return new MockAvailabilityProvider();
  if (kind === "spothero") {
    throw new Error(
      "SpotHero availability is not implemented. Set AVAILABILITY_PROVIDER=mock until a SpotHero provider is added."
    );
  }
  throw new Error(`Unknown availability provider "${kind}". Use "mock".`);
}

export async function checkFacilities(
  provider: AvailabilityProvider,
  requests: AvailabilityRequest[],
  ttlMs: number,
  onEach?: (facilityId: string, result: AvailabilityResult) => void
): Promise<Record<string, AvailabilityResult>> {
  const out: Record<string, AvailabilityResult> = {};
  await Promise.all(
    requests.map(async (request) => {
      const key = `${provider.name}|${request.facilityId}|${request.start || ""}|${request.end || ""}`;
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expires > now) {
        const value = { ...hit.value, cached: true };
        out[request.facilityId] = value;
        onEach?.(request.facilityId, value);
        return;
      }
      const fresh = await provider.check(request);
      const value = { ...fresh, cached: false };
      if (ttlMs > 0) cache.set(key, { expires: now + ttlMs, value: { ...fresh } });
      out[request.facilityId] = value;
      onEach?.(request.facilityId, value);
    })
  );
  return out;
}
