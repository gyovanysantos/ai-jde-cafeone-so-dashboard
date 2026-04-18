// ============================================================================
// Azure Function: getOrderData
// ============================================================================
// This function proxies JDE AIS REST API calls so that AIS credentials
// never reach the browser. It:
//   1. Reads AIS_BASE_URL, AIS_USERNAME, AIS_PASSWORD from SWA app settings
//   2. Queries F4211 via AIS Data Service in STATELESS mode (creds in each req)
//   3. Normalizes the response into 3 dashboard datasets
//   4. Returns JSON to the browser
//
// Stateless mode: username+password are sent directly in the dataservice body,
// avoiding the separate tokenrequest + JSESSIONID cookie round-trip that
// doesn't work reliably from serverless environments.
//
// Query params: ?orderNumber=XXXXX&businessUnit=XXX (both optional)
// ============================================================================

/**
 * Reads AIS credentials from SWA app settings (environment variables).
 */
function getSecrets() {
  const baseUrl = process.env.AIS_BASE_URL;
  const username = process.env.AIS_USERNAME;
  const password = process.env.AIS_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Missing AIS credentials. Set AIS_BASE_URL, AIS_USERNAME, AIS_PASSWORD in SWA app settings."
    );
  }

  return { baseUrl, username, password };
}

/**
 * Queries JDE table F4211 (Sales Order Detail) via AIS Data Service in STATELESS mode.
 *
 * Stateless mode sends username+password directly in the dataservice request body
 * instead of using a separate token. This avoids JSESSIONID cookie issues in
 * serverless environments (Azure Functions, SWA managed APIs, etc.).
 *
 * JDE Table: F4211 — Sales Order Detail
 * Key fields:
 *   - DOCO  (F4211.DOCO)  — Order Number
 *   - MCU   (F4211.MCU)   — Business Unit
 *   - NXTR  (F4211.NXTR)  — Next Status Code
 *   - AEXP  (F4211.AEXP)  — Extended Price
 *   - SHAN  (F4211.SHAN)  — Ship To Address Number
 *   - LITM  (F4211.LITM)  — 2nd Item Number
 *   - DRQJ  (F4211.DRQJ)  — Date Requested (Julian)
 *   - DSC1  (F4211.DSC1)  — Description Line 1
 */
async function aisQueryOrderLines(baseUrl, username, password, orderNumber, businessUnit, signal) {
  const url = `${baseUrl}/jderest/v2/dataservice`;

  // Stateless request: credentials go in the body (no token needed)
  const requestBody = {
    username,
    password,
    targetName: "F4211",
    targetType: "table",
    dataServiceType: "BROWSE",
    maxPageSize: "500",
    returnControlIDs: "F4211.DOCO|F4211.NXTR|F4211.AEXP|F4211.SHAN|F4211.LITM|F4211.DRQJ|F4211.DSC1|F4211.MCU",
  };

  // Build query conditions dynamically
  const conditions = [];

  if (orderNumber) {
    conditions.push({
      value: [{ content: orderNumber, specialValueId: "LITERAL" }],
      controlId: "F4211.DOCO",
      operator: "EQUAL",
    });
  }

  if (businessUnit) {
    conditions.push({
      value: [{ content: businessUnit, specialValueId: "LITERAL" }],
      controlId: "F4211.MCU",
      operator: "EQUAL",
    });
  }

  if (conditions.length > 0) {
    requestBody.query = { condition: conditions };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AIS data service query failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  // AIS returns rows in "fs_DATABROWSE_F4211.data.gridData.rowset"
  const rowset =
    data?.fs_DATABROWSE_F4211?.data?.gridData?.rowset || [];

  return rowset;
}

/**
 * Transforms raw F4211 rowset into 3 dashboard datasets.
 */
function normalizeData(rowset) {
  // --- 1. Status counts (for Pie Chart) ---
  const statusCounts = {};
  for (const row of rowset) {
    // NXTR = Next Status code (e.g., "520", "540", "560", "580", "999")
    const status = String(row.F4211_NXTR || "Unknown");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  // --- 2. Item amounts (for Table) ---
  const itemTotals = {};
  for (const row of rowset) {
    const item = String(row.F4211_LITM || "Unknown");
    const desc = String(row.F4211_DSC1 || "");
    const shipTo = String(row.F4211_SHAN || "");
    const amount = parseFloat(row.F4211_AEXP) || 0;

    if (!itemTotals[item]) {
      itemTotals[item] = { item, description: desc, shipTo, amount: 0 };
    }
    itemTotals[item].amount += amount;
  }
  // Sort by amount descending, take top 10
  const itemAmountData = Object.values(itemTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // --- 3. Ship date buckets (for Bar Chart) ---
  const dateBuckets = {};
  for (const row of rowset) {
    // DRQJ is a JDE Julian date (format: CYYDDD where C=century, YY=year, DDD=day of year)
    // AIS may return it as a standard date string or as a Julian number — handle both
    let dateKey;
    const rawDate = row.F4211_DRQJ;

    if (typeof rawDate === "string" && rawDate.includes("-")) {
      // ISO date string from AIS (e.g., "2026-04-15")
      dateKey = rawDate.substring(0, 10);
    } else if (rawDate) {
      // JDE Julian: convert CYYDDD to YYYY-MM-DD
      const julian = String(rawDate).padStart(6, "0");
      const century = parseInt(julian[0]) + 19; // C=0 → 19xx, C=1 → 20xx
      const year = century * 100 + parseInt(julian.substring(1, 3));
      const dayOfYear = parseInt(julian.substring(3, 6));
      const d = new Date(year, 0, dayOfYear);
      dateKey = d.toISOString().substring(0, 10);
    } else {
      dateKey = "Unknown";
    }

    const amount = parseFloat(row.F4211_AEXP) || 0;
    dateBuckets[dateKey] = (dateBuckets[dateKey] || 0) + amount;
  }

  // Sort by date
  const shipDateData = Object.entries(dateBuckets)
    .filter(([d]) => d !== "Unknown")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));

  return { statusData, itemAmountData, shipDateData };
}

// ============================================================================
// Main Azure Function handler
// ============================================================================
module.exports = async function (context, req) {
  const orderNumber = req.query.orderNumber || "";
  const businessUnit = req.query.businessUnit || "";

  // Sanitize: if orderNumber is provided, it must be numeric (JDE DOCO is always numeric)
  if (orderNumber && !/^\d+$/.test(orderNumber)) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "orderNumber must be numeric",
      }),
    };
    return;
  }

  // 10-second timeout for the entire AIS round-trip
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // 1. Get AIS credentials from app settings
    const secrets = getSecrets();
    const { baseUrl, username, password } = secrets;

    // 2. Query F4211 in stateless mode (credentials in request body)
    const rowset = await aisQueryOrderLines(
      baseUrl,
      username,
      password,
      orderNumber,
      businessUnit,
      controller.signal
    );

    // 3. Normalize into dashboard datasets
    const dashboardData = normalizeData(rowset);

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        orderNumber,
        businessUnit,
        lineCount: rowset.length,
        ...dashboardData,
      }),
    };
  } catch (err) {
    const isTimeout = err.name === "AbortError";
    context.log.error("AIS API error:", err.message);

    context.res = {
      status: isTimeout ? 504 : 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: isTimeout
          ? "AIS request timed out (10s). Check AIS server connectivity."
          : `AIS API error: ${err.message}`,
      }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
