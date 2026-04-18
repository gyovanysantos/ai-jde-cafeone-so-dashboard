// ============================================================================
// Chart.js — Pie Chart (Orders by Status) + Bar Chart (Ship Date Amounts)
// ============================================================================
// Imports Chart.js from the global `Chart` object loaded via CDN in index.html.
// Only registers the components we actually use to keep the bundle lean.
// ============================================================================

import { STATUS_LABELS } from "./mockData.js";

// Chart.js is loaded globally via CDN <script> tag — available as `window.Chart`
const Chart = window.Chart;

// Color palette for charts — JDE-compatible blues + accents
const COLORS = [
  "#1a6496", // Primary JDE blue
  "#2980b9", // Lighter blue
  "#27ae60", // Green (shipped/complete)
  "#f39c12", // Orange (attention)
  "#e74c3c", // Red (cancelled/error)
  "#8e44ad", // Purple
  "#1abc9c", // Teal
  "#34495e", // Dark gray-blue
];

/**
 * Renders or updates the Orders by Status pie/doughnut chart.
 *
 * @param {string} containerId — ID of the <canvas> element
 * @param {Array<{status: string, count: number}>} data
 * @returns {Chart} — the Chart.js instance (store it for later updates)
 */
export function renderStatusPieChart(containerId, data) {
  const canvas = document.getElementById(containerId);
  const ctx = canvas.getContext("2d");

  // Destroy existing chart if re-rendering
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const labels = data.map(
    (d) => STATUS_LABELS[d.status] || `Status ${d.status}`
  );
  const values = data.map((d) => d.count);

  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: COLORS.slice(0, data.length),
          borderWidth: 2,
          borderColor: "#ffffff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            usePointStyle: true,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} lines (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Renders or updates the Ship Date bar chart with a "today" annotation line.
 *
 * @param {string} containerId — ID of the <canvas> element
 * @param {Array<{date: string, amount: number}>} data
 * @returns {Chart} — the Chart.js instance
 */
export function renderShipDateBarChart(containerId, data) {
  const canvas = document.getElementById(containerId);
  const ctx = canvas.getContext("2d");

  // Destroy existing chart if re-rendering
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const todayStr = new Date().toISOString().substring(0, 10);
  const labels = data.map((d) => d.date);
  const values = data.map((d) => d.amount);

  // Find the index of today's date for the annotation line
  const todayIndex = labels.indexOf(todayStr);

  // Color bars: past = lighter blue, future = primary blue, today = accent
  const barColors = labels.map((label) => {
    if (label === todayStr) return "#e74c3c"; // Red for today
    return label < todayStr ? "#a8d5f2" : "#1a6496";
  });

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.map((l) => {
        // Shorten date labels: "Apr 15" instead of "2026-04-15"
        const d = new Date(l + "T00:00:00");
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }),
      datasets: [
        {
          label: "Amount ($)",
          data: values,
          backgroundColor: barColors,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 45,
            font: { size: 9 },
            // Show every 5th label to avoid crowding
            callback: function (val, index) {
              return index % 5 === 0 ? this.getLabelForValue(val) : "";
            },
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => "$" + val.toLocaleString(),
            font: { size: 10 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              // Show full date in tooltip
              const idx = items[0].dataIndex;
              return labels[idx];
            },
            label: (ctx) =>
              `$${ctx.parsed.y.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}`,
          },
        },
        // "Today" annotation line — uses the chartjs-plugin-annotation if available,
        // otherwise we draw it manually via the afterDraw hook below
      },
    },
    plugins: [
      {
        id: "todayLine",
        afterDraw: (chart) => {
          if (todayIndex < 0) return;
          const meta = chart.getDatasetMeta(0);
          if (!meta.data[todayIndex]) return;

          const x = meta.data[todayIndex].x;
          const { top, bottom } = chart.chartArea;
          const drawCtx = chart.ctx;

          drawCtx.save();
          drawCtx.strokeStyle = "#e74c3c";
          drawCtx.lineWidth = 2;
          drawCtx.setLineDash([5, 3]);
          drawCtx.beginPath();
          drawCtx.moveTo(x, top);
          drawCtx.lineTo(x, bottom);
          drawCtx.stroke();

          // Label
          drawCtx.fillStyle = "#e74c3c";
          drawCtx.font = "bold 10px sans-serif";
          drawCtx.textAlign = "center";
          drawCtx.fillText("TODAY", x, top - 5);
          drawCtx.restore();
        },
      },
    ],
  });
}
