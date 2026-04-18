// ============================================================================
// Sortable Table — Order Amount by Item
// ============================================================================
// Renders a sortable HTML table showing extended price (AEXP) grouped by item.
// Each row has a CSS-width bar indicator showing relative amount.
// No external dependencies — pure DOM manipulation.
// ============================================================================

/**
 * Renders the item amount table inside the given container element.
 *
 * @param {string} containerId — ID of the container <div>
 * @param {Array<{item: string, description: string, shipTo: string, amount: number}>} data
 */
export function renderAmountTable(containerId, data) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="no-data">No order line data available.</p>';
    return;
  }

  // Track sort state
  let sortColumn = "amount";
  let sortAsc = false; // Default: descending by amount

  // Find max amount for the bar width calculation
  const maxAmount = Math.max(...data.map((d) => d.amount));

  function buildTable(sortedData) {
    // Clear and rebuild
    container.innerHTML = "";

    const table = document.createElement("table");
    table.className = "amount-table";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const columns = [
      { key: "item", label: "Item (LITM)" },
      { key: "description", label: "Description" },
      { key: "shipTo", label: "Ship To" },
      { key: "amount", label: "Ext. Price ($)" },
    ];

    for (const col of columns) {
      const th = document.createElement("th");
      th.textContent = col.label;
      th.dataset.column = col.key;
      th.className = "sortable";

      // Show sort indicator
      if (col.key === sortColumn) {
        th.classList.add(sortAsc ? "sort-asc" : "sort-desc");
      }

      th.addEventListener("click", () => {
        if (sortColumn === col.key) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col.key;
          sortAsc = col.key !== "amount"; // Default asc for text, desc for numbers
        }
        const reSorted = [...data].sort((a, b) => {
          const aVal = a[col.key];
          const bVal = b[col.key];
          if (typeof aVal === "number") {
            return sortAsc ? aVal - bVal : bVal - aVal;
          }
          return sortAsc
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
        });
        buildTable(reSorted);
      });

      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");

    for (const row of sortedData) {
      const tr = document.createElement("tr");

      // Item
      const tdItem = document.createElement("td");
      tdItem.textContent = row.item;
      tdItem.className = "cell-item";
      tr.appendChild(tdItem);

      // Description
      const tdDesc = document.createElement("td");
      tdDesc.textContent = row.description;
      tdDesc.className = "cell-desc";
      tr.appendChild(tdDesc);

      // Ship To
      const tdShipTo = document.createElement("td");
      tdShipTo.textContent = row.shipTo;
      tdShipTo.className = "cell-shipto";
      tr.appendChild(tdShipTo);

      // Amount with bar indicator
      const tdAmount = document.createElement("td");
      tdAmount.className = "cell-amount";

      const amountText = document.createElement("span");
      amountText.className = "amount-value";
      amountText.textContent = "$" + row.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const bar = document.createElement("div");
      bar.className = "amount-bar";
      const pct = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;
      bar.style.width = pct + "%";

      tdAmount.appendChild(amountText);
      tdAmount.appendChild(bar);
      tr.appendChild(tdAmount);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    container.appendChild(table);
  }

  // Initial render with current sort
  const sorted = [...data].sort((a, b) =>
    sortAsc ? a[sortColumn] - b[sortColumn] : b[sortColumn] - a[sortColumn]
  );
  buildTable(sorted);
}
