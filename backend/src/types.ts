export interface Facility {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  stalls: number | null;
  hours: string;
  notes: string;
  managed: boolean;
  example: boolean;
}

export interface FacilityCatalog {
  source: string;
  disclaimer: string;
  exampleData: boolean;
  facilities: Facility[];
}

export type AvailabilityStatus = "available" | "limited" | "unavailable" | "unknown";

export interface AvailabilityResult {
  status: AvailabilityStatus;
  stallsAvailable: number | null;
  note?: string;
  cached?: boolean;
  checkedAt?: string;
}

export interface AvailabilityRequest {
  facilityId: string;
  start?: string;
  end?: string;
}

export interface AvailabilityProvider {
  readonly name: string;
  check(request: AvailabilityRequest): Promise<AvailabilityResult>;
}
