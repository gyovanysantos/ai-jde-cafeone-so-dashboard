// ============================================================================
// Mock Data for CaféOne Sales Order Dashboard
// ============================================================================
// Used when the page loads WITHOUT JDE URL parameters (default/demo mode).
// All values are realistic JDE-style samples so a CNC can verify the format.
// ============================================================================

/**
 * Mock: Orders by Status (Pie Chart)
 *
 * JDE Next Status codes (F4211.NXTR) — typical Sales Order flow:
 *   520 = Printed / Pick Slip
 *   540 = Shipped (confirmed)
 *   560 = Invoiced
 *   580 = Closed / Complete
 *   999 = Cancelled
 */
export const mockStatusData = [
  { status: "520", count: 12 },
  { status: "540", count: 8 },
  { status: "560", count: 15 },
  { status: "580", count: 5 },
  { status: "999", count: 2 },
];

/**
 * Mock: Order Amount by Item (Table)
 *
 * Fields mirror F4211 columns:
 *   LITM = 2nd Item Number (short item code)
 *   DSC1 = Description Line 1
 *   SHAN = Ship To Address Number
 *   AEXP = Extended Price (line total)
 */
export const mockItemAmountData = [
  { item: "7001-WIDGET",   description: "Standard Widget A",       shipTo: "4242", amount: 45200.00 },
  { item: "7002-GADGET",   description: "Premium Gadget B",        shipTo: "4243", amount: 38750.50 },
  { item: "7003-SPROCKET", description: "Industrial Sprocket",     shipTo: "4244", amount: 27300.00 },
  { item: "7004-BEARING",  description: "Roller Bearing Assembly",  shipTo: "4242", amount: 21890.75 },
  { item: "7005-FLANGE",   description: "Steel Flange 4in",        shipTo: "4245", amount: 18500.00 },
  { item: "7006-VALVE",    description: "Check Valve SS316",       shipTo: "4243", amount: 15200.00 },
  { item: "7007-PUMP",     description: "Centrifugal Pump 2HP",    shipTo: "4246", amount: 12800.25 },
  { item: "7008-MOTOR",    description: "Electric Motor 5HP",      shipTo: "4244", amount: 9600.00 },
  { item: "7009-SEAL",     description: "Mechanical Seal Kit",     shipTo: "4242", amount: 7400.00 },
  { item: "7010-GASKET",   description: "Spiral Wound Gasket",     shipTo: "4247", amount: 4200.50 },
];

/**
 * Mock: Orders by Requested Ship Date (Bar Chart)
 *
 * Generates date buckets spanning 30 days before today through 30 days after.
 * Each bucket has a dollar amount — simulates real order distribution.
 */
export function generateMockShipDateData() {
  const data = [];
  const today = new Date();

  for (let i = -30; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().substring(0, 10);

    // Simulate realistic distribution: higher around today, tailing off
    const distance = Math.abs(i);
    const baseAmount = Math.max(500, 15000 - distance * 400);
    const randomFactor = 0.6 + Math.random() * 0.8;
    const amount = Math.round(baseAmount * randomFactor);

    data.push({ date: dateStr, amount });
  }

  return data;
}

/**
 * Status code descriptions — maps JDE NXTR codes to human-readable labels.
 * A JDE CNC should verify these match the customer's UDC 40/AT setup.
 */
export const STATUS_LABELS = {
  "520": "520 — Printed",
  "540": "540 — Shipped",
  "560": "560 — Invoiced",
  "580": "580 — Complete",
  "999": "999 — Cancelled",
};
