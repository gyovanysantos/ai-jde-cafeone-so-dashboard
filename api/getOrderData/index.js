// ============================================================================
// Azure Function: getOrderData
// ============================================================================
// This function proxies JDE AIS REST API calls so that AIS credentials
// never reach the browser. It:
//   1. Reads AIS_BASE_URL, AIS_USERNAME, AIS_PASSWORD from SWA app settings
//   2. Authenticates to JDE AIS via Basic Auth (POST /jderest/v2/tokenrequest)
//   3. Queries F4211 (Sales Order Detail) for the given order/business unit
//   4. Normalizes the response into 3 dashboard datasets
//   5. Logs out the AIS session
//   6. Returns JSON to the browser
//
// Query params: ?orderNumber=XXXXX&businessUnit=XXX (both optional)
// ============================================================================

/**
 * Reads AIS credentials from SWA app settings (environment variables).
 * These are set via: az staticwebapp appsettings set --name <SWA> --setting-names KEY=VALUE
 * They are stored encrypted at rest and never exposed to the browser.
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
 * Authenticates to JDE AIS Server using Basic Auth.
 *
 * JDE AIS endpoint: POST /jderest/v2/tokenrequest
 * Request body requires username, password, and deviceName.
 * Returns a token string used for subsequent API calls.
 *
 * @see https://docs.oracle.com/en/applications/jd-edwards/cross-product/9.2/eoaai/
 */
async function aisAuthenticate(baseUrl, username, password, signal) {
  const url = `${baseUrl}/jderest/v2/tokenrequest`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      username,
      password,
      deviceName: "CafeOneDashboard",  // Arbitrary device identifier for AIS audit trail
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AIS authentication failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  // AIS returns the token in different fields depending on Tools Release version:
  // - "userInfo.token" (9.2.5+)
  // - "userInfo.token" nested inside the response
  const token = data.userInfo?.token;
  if (!token) {
    throw new Error("AIS authentication succeeded but no token returned. Check AIS server version.");
  }

  return token;
}

/**
 * Queries JDE table F4211 (Sales Order Detail / SO Detail File) via AIS Data Service.
 *
 * JDE Table: F4211 — Sales Order Detail
 * Key fields queried:
 *   - DOCO  (F4211.DOCO)  — Order Number (Document Order Number)
 *   - MCU   (F4211.MCU)   — Business Unit (Branch/Plant)
 *   - NXTR  (F4211.NXTR)  — Next Status Code (line status in order flow)
 *   - AEXP  (F4211.AEXP)  — Extended Price (amount for the line)
 *   - SHAN  (F4211.SHAN)  — Ship To Address Number (customer)
 *   - LITM  (F4211.LITM)  — 2nd Item Number (usually the short item ID)
 *   - DRQJ  (F4211.DRQJ)  — Date Requested (Julian) — requested ship date
 *   - DSC1  (F4211.DSC1)  — Description Line 1 (item description)
 *
 * AIS endpoint: POST /jderest/v2/dataservice
 *
 * NOTE: If your JDE environment restricts direct F4211 access via AIS dataservice,
 * you'll need to create a JDE Orchestrator that calls P4210/W4210A (Sales Order Entry)
 * and returns the detail grid data. The orchestrator endpoint would be:
 *   POST /jderest/v2/orchestrator/{orchestratorName}
 */
async function aisQueryOrderLines(baseUrl, token, orderNumber, businessUnit, signal) {
  const url = `${baseUrl}/jderest/v2/dataservice`;

  // Build the AIS Data Service request
  const requestBody = {
    token,
    targetName: "F4211",        // JDE table: Sales Order Detail
    targetType: "table",
    dataServiceType: "BROWSE",
    maxPageSize: "500",          // Max rows to return — adjust if needed
    returnControlIDs: "F4211.DOCO|F4211.NXTR|F4211.AEXP|F4211.SHAN|F4211.LITM|F4211.DRQJ|F4211.DSC1|F4211.MCU",
  };

  // Build query conditions dynamically — only filter when params are provided.
  // When no orderNumber is given, we fetch ALL rows from F4211 (up to maxPageSize).
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

  // Only attach the query block if there are conditions to apply
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
  // The exact path may vary by AIS version — adjust if needed
  const rowset =
    data?.fs_DATABROWSE_F4211?.data?.gridData?.rowset || [];

  return rowset;
}

/**
 * Logs out the AIS session to free server resources.
 * JDE AIS endpoint: POST /jderest/v2/tokenrequest/logout
 */
async function aisLogout(baseUrl, token) {
  try {
    await fetch(`${baseUrl}/jderest/v2/tokenrequest/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Logout failure is non-critical — AIS sessions time out automatically
  }
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
  let token = null;

  try {
    // 1. Get AIS credentials from app settings
    const secrets = getSecrets();
    const { baseUrl, username, password } = secrets;

    // 2. Authenticate to AIS
    token = await aisAuthenticate(baseUrl, username, password, controller.signal);

    // 3. Query F4211
    const rowset = await aisQueryOrderLines(
      baseUrl,
      token,
      orderNumber,
      businessUnit,
      controller.signal
    );

    // 4. Normalize into dashboard datasets
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

    // 5. Always logout AIS session
    if (token) {
      try {
        const secrets = getSecrets();
        await aisLogout(secrets.baseUrl, token);
      } catch {
        // Non-critical
      }
    }
  }
};
