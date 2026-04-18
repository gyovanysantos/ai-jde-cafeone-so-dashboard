// ============================================================================
// Browser-side API Client — calls the Azure Function proxy
// ============================================================================
// This module does NOT talk to JDE AIS directly. Instead, it calls our
// Azure Function at /api/getOrderData which handles AIS auth + queries.
// This keeps AIS credentials out of the browser entirely.
// ============================================================================

/**
 * Fetches dashboard data for a Sales Order from the Azure Function proxy.
 *
 * @param {string} orderNumber — JDE Sales Order number (F4201.DOCO)
 * @param {string} [businessUnit] — JDE Business Unit / Branch Plant (F4201.MCU)
 * @returns {Promise<{statusData, itemAmountData, shipDateData, lineCount}>}
 * @throws {Error} with a user-friendly message on failure
 */
export async function fetchDashboardData(orderNumber, businessUnit = "") {
  // 10-second timeout — matches the Azure Function's internal timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const params = new URLSearchParams({ orderNumber });
    if (businessUnit) {
      params.set("businessUnit", businessUnit);
    }

    const response = await fetch(`/api/getOrderData?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody.error || `API returned status ${response.status}`
      );
    }

    const data = await response.json();

    return {
      orderNumber: data.orderNumber,
      businessUnit: data.businessUnit,
      lineCount: data.lineCount,
      statusData: data.statusData || [],
      itemAmountData: data.itemAmountData || [],
      shipDateData: data.shipDateData || [],
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. The AIS server may be slow or unreachable.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
