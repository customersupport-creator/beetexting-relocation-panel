import assert from "node:assert/strict";
import test from "node:test";
import { mapAirtableRecord, type AirtableFieldMap } from "../src/airtableMap";

const fields: AirtableFieldMap = {
  name: "Name",
  address: "Address",
  lat: "Latitude",
  lng: "Longitude",
  stalls: "Stalls",
  hours: "Hours",
  notes: "Notes",
  managed: "Managed"
};

test("maps a managed Airtable record and skips unmanaged or incomplete rows", () => {
  const mapped = mapAirtableRecord(
    {
      id: "recExample",
      fields: {
        Name: "North Garage",
        Address: "1 Example Ave",
        Latitude: "42.35",
        Longitude: -71.07,
        Stalls: 40,
        Hours: "24 hours",
        Notes: "Covered",
        Managed: true
      }
    },
    fields
  );
  assert.equal(mapped !== "skip-invalid" && mapped !== "skip-unmanaged" && mapped.id, "airtable:recExample");
  if (mapped === "skip-invalid" || mapped === "skip-unmanaged") return;
  assert.equal(mapped.lat, 42.35);
  assert.equal(mapped.lng, -71.07);
  assert.equal(mapped.example, false);
  assert.equal(mapped.managed, true);

  assert.equal(
    mapAirtableRecord({ id: "recNo", fields: { Name: "Private", Address: "9 Oak St", Managed: "no" } }, fields),
    "skip-unmanaged"
  );
  assert.equal(mapAirtableRecord({ id: "recBad", fields: { Name: "Missing address" } }, fields), "skip-invalid");
  const assumed = mapAirtableRecord({ id: "recOpen", fields: { Name: "Open Lot", Address: "2 Main St" } }, fields);
  assert.equal(assumed !== "skip-invalid" && assumed !== "skip-unmanaged" && assumed.managed, true);
});
