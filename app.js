/* app.js — Big G Steel LLC TR-13 / CMAA field check
   Updated to:
   - Treat "North-to-South span measurements" as CROSS-LEVEL (vertical elevation difference TOP OF RAIL to TOP OF RAIL)
   - Render a markup-style RUNWAY DIAGRAM (SVG) with station values + fail highlighting + correction callouts
   - Embed the diagram into the Print/PDF popup export (no external libs required)
*/

/* ---------------- Profiles ---------------- */

const profiles = {
  "CMAA 70 / 74 + TR-13 (field defaults)": {
    checks: [
      {
        id: "spanDeviation",
        label: "Overall runway span deviation from design",
        reference: "CMAA 70/74 + TR-13 practice",
        inputs: [
          { id: "designSpan", label: "Design span (in)", value: 1200 },
          { id: "measuredSpan", label: "Measured span (in)", value: 1200.18 },
          { id: "spanTol", label: "Allowed ± span tolerance (in)", value: 0.25 },
        ],
        evaluate: (values) => {
          const deviation = Math.abs(values.measuredSpan - values.designSpan);
          return {
            measuredText: `${deviation.toFixed(3)} in deviation`,
            allowedText: `≤ ${values.spanTol.toFixed(3)} in`,
            pass: deviation <= values.spanTol,
          };
        },
      },
      {
        id: "runwayStraightness",
        label: "Runway centerline straightness offset",
        reference: "TR-13 straightness check",
        inputs: [
          { id: "runout", label: "Measured offset over gauge length (in)", value: 0.21 },
          { id: "runoutTol", label: "Allowed straightness offset (in)", value: 0.25 },
        ],
        evaluate: (values) => ({
          measuredText: `${Math.abs(values.runout).toFixed(3)} in offset`,
          allowedText: `≤ ${values.runoutTol.toFixed(3)} in`,
          pass: Math.abs(values.runout) <= values.runoutTol,
        }),
      },
    ],
  },
};

/* ---------------- DOM lookups (guarded) ---------------- */

const profileSelect = document.getElementById("profileSelect");
const form = document.getElementById("measurementForm");
const runBtn = document.getElementById("runCheck");
const resultBody = document.querySelector("#resultTable tbody");
const summary = document.getElementById("summary");

const columnsPerSideInput = document.getElementById("columnsPerSide");
const measuredStationDistanceInput = document.getElementById("measuredStationDistance");
const directionPairInput = document.getElementById("directionPair");
const buildLayoutBtn = document.getElementById("buildLayout");
const layoutContainer = document.getElementById("layoutContainer");

const suggestions = document.getElementById("suggestions"); // optional
const suggestionList = document.getElementById("suggestionList"); // optional
const exportPdfBtn = document.getElementById("exportPdf");

// NEW (optional) diagram UI — add these IDs in your HTML if you want on-page rendering:
// <button id="renderDiagram">Render Diagram</button>
// <svg id="runwaySvg" ...></svg>
const renderDiagramBtn = document.getElementById("renderDiagram"); // optional
const runwaySvg = document.getElementById("runwaySvg"); // optional

let latestRows = [];
let latestDiagramSvgString = ""; // stored for export popup inclusion

// Required for core app (diagram controls are optional)
const REQUIRED = [
  ["profileSelect", profileSelect],
  ["measurementForm", form],
  ["runCheck", runBtn],
  ["#resultTable tbody", resultBody],
  ["summary", summary],
  ["columnsPerSide", columnsPerSideInput],
  ["measuredStationDistance", measuredStationDistanceInput],
  ["directionPair", directionPairInput],
  ["buildLayout", buildLayoutBtn],
  ["layoutContainer", layoutContainer],
  ["exportPdf", exportPdfBtn],
];

function assertRequiredDom() {
  const missing = REQUIRED.filter(([, el]) => !el).map(([name]) => name);
  if (missing.length) {
    console.error("App initialization failed. Missing DOM elements:", missing);
    if (summary) {
      summary.textContent =
        `App error: Missing required page elements (${missing.join(", ")}). ` +
        "Verify index.html IDs match app.js.";
    }
    return false;
  }
  return true;
}

/* ---------------- Profiles / base form ---------------- */

function buildProfileOptions() {
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    profileSelect.append(option);
  });
}

function activeProfile() {
  return profiles[profileSelect.value];
}

function renderForm() {
  form.innerHTML = "";
  const profile = activeProfile();

  profile.checks.forEach((check) => {
    check.inputs.forEach((input) => {
      const label = document.createElement("label");
      label.innerHTML = `${check.label} — ${input.label}
        <input type="number" step="any" id="${check.id}_${input.id}" value="${input.value}" />`;
      form.append(label);
    });
  });
}

/* ---------------- Layout generation ---------------- */

function stationOffsets(designDistanceFt, stationDistanceFt) {
  const offsets = [];
  for (let offset = 0; offset < designDistanceFt; offset += stationDistanceFt) offsets.push(offset);
  return offsets;
}

function sideConfig() {
  const [sideA, sideB] = directionPairInput.value.split("|");
  return [
    { key: "sideA", label: sideA },
    { key: "sideB", label: sideB },
  ];
}

function buildLayout() {
  layoutContainer.innerHTML = "";

  const columns = Number(columnsPerSideInput.value);
  const measuredStationDistance = Number(measuredStationDistanceInput.value);

  if (columns < 2 || measuredStationDistance <= 0) {
    summary.textContent =
      "Columns per side must be 2+ and measured station distance must be greater than 0.";
    return;
  }

  const sides = sideConfig();

  // Column-to-column distances
  sides.forEach((side) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "grid";
    fieldset.innerHTML = `<legend>${side.label} column-to-column distances (ft)</legend>`;

    for (let segment = 1; segment < columns; segment += 1) {
      const designLabel = document.createElement("label");
      designLabel.innerHTML = `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} designed distance (ft)
        <input type="number" step="any" min="0" id="${side.key}_design_distance_${segment}" value="60" />`;
      fieldset.append(designLabel);

      const actualLabel = document.createElement("label");
      actualLabel.innerHTML = `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} actual distance (ft)
        <input type="number" step="any" min="0" id="${side.key}_actual_distance_${segment}" value="60" />`;
      fieldset.append(actualLabel);
    }

    layoutContainer.append(fieldset);
  });

  // Side elevation measurements (baseline)
  const sideMeasurements = document.createElement("fieldset");
  sideMeasurements.className = "grid";
  sideMeasurements.innerHTML =
    "<legend>Side elevation measurements from Baseline (TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>";

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const designDistance = Number(
        document.getElementById(`${side.key}_design_distance_${segment}`)?.value ?? 60
      );

      stationOffsets(designDistance, measuredStationDistance).forEach((offset) => {
        const label = document.createElement("label");
        label.innerHTML = `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} elevation from Baseline at ${offset} ft station (in)
          <input type="number" step="any" id="${side.key}_segment_${segment}_station_${offset}" value="0" />`;
        sideMeasurements.append(label);
      });
    }
  });
  layoutContainer.append(sideMeasurements);

  // Cross-level measurements between sides (THIS IS NOT SPAN/GAUGE)
  const crossLevelMeasurements = document.createElement("fieldset");
  crossLevelMeasurements.className = "grid";
  crossLevelMeasurements.innerHTML = `<legend>${sides[0].label} to ${sides[1].label} CROSS-LEVEL measurements (TOP OF RAIL to TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>`;

  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = Number(
      document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 60
    );
    const sideBDesignDistance = Number(
      document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 60
    );

    stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance).forEach(
      (offset) => {
        const label = document.createElement("label");
        label.innerHTML = `${sides[0].label}${segment} to ${sides[1].label}${segment} cross-level at ${offset} ft station (in)
          <input type="number" step="any" id="cross_segment_${segment}_station_${offset}" value="0" />`;
        crossLevelMeasurements.append(label);
      }
    );
  }
  layoutContainer.append(crossLevelMeasurements);

  // Tolerances
  const tolerances = document.createElement("fieldset");
  tolerances.className = "grid two-col";
  tolerances.innerHTML = `<legend>TR-13 checks and tolerances</legend>
    <label>
      Column-to-column distance deviation tolerance (in)
      <input type="number" step="any" min="0" id="columnDistanceTol" value="0.25" />
    </label>
    <label>
      Side elevation from Baseline tolerance (in)
      <input type="number" step="any" min="0" id="baselineTol" value="0.125" />
    </label>
    <label>
      Cross-level tolerance (TOP OF RAIL to TOP OF RAIL) (in)
      <input type="number" step="any" min="0" id="crossLevelTol" value="0.375" />
    </label>`;
  layoutContainer.append(tolerances);

  summary.textContent =
    "Layout built. Enter distances/elevations/cross-level, then run the compliance check.";
}

/* ---------------- Core evaluation ---------------- */

function collectValues(check) {
  return check.inputs.reduce((acc, input) => {
    const el = document.getElementById(`${check.id}_${input.id}`);
    acc[input.id] = Number(el?.value ?? 0);
    return acc;
  }, {});
}

function evaluateElevationRows() {
  const sides = sideConfig();
  const columns = Number(columnsPerSideInput.value);
  const measuredStationDistance = Number(measuredStationDistanceInput.value);

  const baselineTol = Number(document.getElementById("baselineTol")?.value ?? 0.125);
  const crossLevelTol = Number(document.getElementById("crossLevelTol")?.value ?? 0.375);
  const columnDistanceTol = Number(document.getElementById("columnDistanceTol")?.value ?? 0.25);

  const rows = [];

  // Side checks
  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const designDistance = Number(document.getElementById(`${side.key}_design_distance_${segment}`)?.value ?? 0);
      const actualDistance = Number(document.getElementById(`${side.key}_actual_distance_${segment}`)?.value ?? 0);

      const distanceDeviationIn = Math.abs(actualDistance - designDistance) * 12;

      rows.push({
        check: `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} distance check`,
        measuredText: `${distanceDeviationIn.toFixed(3)} in deviation`,
        allowedText: `≤ ${columnDistanceTol.toFixed(3)} in`,
        pass: distanceDeviationIn <= columnDistanceTol,
        reference: "TR-13 column line distance / verification",
      });

      const offsets = stationOffsets(designDistance, measuredStationDistance);
      offsets.forEach((offset) => {
        const elevationFromBaseline = Math.abs(
          Number(document.getElementById(`${side.key}_segment_${segment}_station_${offset}`)?.value ?? 0)
        );

        rows.push({
          check: `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} baseline check at ${offset} ft`,
          measuredText: `${elevationFromBaseline.toFixed(3)} in from baseline`,
          allowedText: `≤ ${baselineTol.toFixed(3)} in`,
          pass: elevationFromBaseline <= baselineTol,
          reference: "TR-13 baseline elevation check (TOP OF RAIL)",
        });
      });
    }
  });

  // Cross-level checks (TOP OF RAIL to TOP OF RAIL)
  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = Number(document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 0);
    const sideBDesignDistance = Number(document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 0);

    const offsets = stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance);

    offsets.forEach((offset) => {
      const crossLevelValue = Math.abs(
        Number(document.getElementById(`cross_segment_${segment}_station_${offset}`)?.value ?? 0)
      );

      rows.push({
        check: `${sides[0].label}${segment} to ${sides[1].label}${segment} cross-level at ${offset} ft station`,
        measuredText: `${crossLevelValue.toFixed(3)} in cross-level`,
        allowedText: `≤ ${crossLevelTol.toFixed(3)} in`,
        pass: crossLevelValue <= crossLevelTol,
        reference: "TR-13 cross-level tolerance (TOP OF RAIL to TOP OF RAIL)",
      });
    });
  }

  return rows;
}

/* ---------------- Suggestions ---------------- */

function suggestionForRow(row) {
  const check = row.check.toLowerCase();

  if (check.includes("distance check")) {
    return "Verify column plumbness and anchor position; shim base plates or re-align support steel before final tightening.";
  }
  if (check.includes("baseline check")) {
    return "Adjust rail seat elevation with shim packs/grout and re-shoot baseline elevations at the affected stations.";
  }
  if (check.includes("cross-level")) {
    return "Correct cross-level by raising the low side or lowering the high side at the affected station(s). Re-check from the same datum on TOP OF RAIL.";
  }
  if (check.includes("span deviation")) {
    return "Reconfirm runway gauge control lines and shift runway members to restore design span within tolerance.";
  }
  if (check.includes("straightness")) {
    return "Check beam alignment/stringline and adjust connection points to reduce centerline runout before remeasurement.";
  }

  return "Review this failed item with engineering, correct the geometry/elevation source, and remeasure before acceptance.";
}

function renderSuggestions(rows) {
  if (!suggestionList) return;

  const failures = rows.filter((row) => !row.pass);
  if (!failures.length) {
    suggestionList.innerHTML = "<li>All checks passed. No adjustment actions are currently required.</li>";
    return;
  }

  suggestionList.innerHTML = failures
    .map((row) => `<li><strong>${row.check}:</strong> ${suggestionForRow(row)}</li>`)
    .join("");
}

/* ---------------- Diagram (SVG) generation ---------------- */

function nearestFractionStringInches(valueIn) {
  const abs = Math.abs(Number(valueIn) || 0);
  const fracMap = [
    { val: 0.0, s: `0"` },
    { val: 0.0625, s: `1/16"` },
    { val: 0.125, s: `1/8"` },
    { val: 0.1875, s: `3/16"` },
    { val: 0.25, s: `1/4"` },
    { val: 0.3125, s: `5/16"` },
    { val: 0.375, s: `3/8"` },
    { val: 0.4375, s: `7/16"` },
    { val: 0.5, s: `1/2"` },
    { val: 0.625, s: `5/8"` },
    { val: 0.75, s: `3/4"` },
    { val: 0.875, s: `7/8"` },
    { val: 1.0, s: `1"` },
    { val: 1.125, s: `1 1/8"` },
    { val: 1.25, s: `1 1/4"` },
    { val: 1.5, s: `1 1/2"` },
    { val: 2.0, s: `2"` },
    { val: 3.0, s: `3"` },
  ];
  let best = fracMap[0];
  for (const f of fracMap) {
    if (Math.abs(f.val - abs) < Math.abs(best.val - abs)) best = f;
  }
  return best.s;
}

/**
 * Collect cross-level station data across all segments and flatten into
 * a single station line (0,10,20...) for drawing.
 *
 * For the diagram, we typically want ONE line of stations.
 * If you have multiple segments, we concatenate by station along the runway:
 *   Segment1: 0..(L1)
 *   Segment2: 0..(L2) appended with +L1, etc.
 *
 * This produces global stations and cross-level values for each station.
 */
function collectCrossLevelSeries() {
  const sides = sideConfig();
  const columns = Number(columnsPerSideInput.value);
  const measuredStationDistance = Number(measuredStationDistanceInput.value);

  const points = []; // { stationFt, valueIn, segment, localOffsetFt }
  let cumulativeFt = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = Number(document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 0);
    const sideBDesignDistance = Number(document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 0);
    const segmentLenFt = Math.min(sideADesignDistance, sideBDesignDistance);

    const offsets = stationOffsets(segmentLenFt, measuredStationDistance);
    offsets.forEach((offsetFt) => {
      const v = Number(document.getElementById(`cross_segment_${segment}_station_${offsetFt}`)?.value ?? 0);
      points.push({
        stationFt: cumulativeFt + offsetFt,
        valueIn: v,
        segment,
        localOffsetFt: offsetFt,
        pairLabel: `${sides[0].label}${segment}–${sides[1].label}${segment}`,
      });
    });

    cumulativeFt += segmentLenFt;
  }

  // If no data, return empty
  return points;
}

/**
 * Build an SVG string resembling a markup drawing:
 * - Two runway lines
 * - Station markers
 * - Vertical dimension arrows
 * - Value boxes (red when fail)
 * - Bracket label for failing range
 */
function buildRunwayDiagramSvgString() {
  const sides = sideConfig();
  const tol = Number(document.getElementById("crossLevelTol")?.value ?? 0.375);

  const pts = collectCrossLevelSeries();
  if (!pts.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="420" viewBox="0 0 1100 420">
      <rect x="0" y="0" width="1100" height="420" fill="white"/>
      <text x="40" y="60" font-family="Arial" font-size="18" font-weight="700">No cross-level data available to draw.</text>
    </svg>`;
  }

  const W = 1100, H = 420;
  const marginL = 110, marginR = 50;
  const railTopY = 90, railBotY = 300;
  const stationBubbleY = railTopY - 20;

  const minFt = Math.min(...pts.map(p => p.stationFt));
  const maxFt = Math.max(...pts.map(p => p.stationFt));
  const spanFt = Math.max(1, maxFt - minFt);

  const plotW = W - marginL - marginR;
  const xForFt = (ft) => marginL + ((ft - minFt) / spanFt) * plotW;

  const fails = pts.map(p => Math.abs(p.valueIn) > tol);
  const firstFailIdx = fails.indexOf(true);
  const lastFailIdx = fails.lastIndexOf(true);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

  // Correction text rule (simple, practical):
  // - If out of tolerance, show required adjustment to get back to tolerance band:
  //   required = max(0, |value| - tol)
  const correctionText = (v) => {
    const req = Math.max(0, Math.abs(v) - tol);
    return req > 0 ? `V+${nearestFractionStringInches(req)}` : "";
  };

  let svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <marker id="arr" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" />
      </marker>
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>

    <!-- Side labels -->
    <g>
      <circle cx="55" cy="${railTopY+7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railTopY+12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${esc(sides[0].label[0] || "A")}</text>

      <circle cx="55" cy="${railBotY+7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railBotY+12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${esc(sides[1].label[0] || "B")}</text>
    </g>

    <!-- Runway beams/rails -->
    <rect x="${marginL}" y="${railTopY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    <rect x="${marginL}" y="${railBotY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>

    <!-- Title -->
    <text x="${marginL}" y="32" font-family="Arial" font-size="18" font-weight="800">CROSS-LEVEL MARKUP (TOP OF RAIL to TOP OF RAIL)</text>
    <text x="${marginL}" y="54" font-family="Arial" font-size="12">Tolerance: ≤ ${tol.toFixed(3)} in (TR-13)</text>
  `;

  // Bracket for failing range
  if (firstFailIdx !== -1) {
    const x1 = xForFt(pts[firstFailIdx].stationFt);
    const x2 = xForFt(pts[lastFailIdx].stationFt);
    svg += `
      <path d="M${x1} 70 L${x1} 88 M${x1} 70 L${x2} 70 M${x2} 70 L${x2} 88"
            fill="none" stroke="red" stroke-width="3"/>
      <text x="${(x1+x2)/2}" y="62" text-anchor="middle" font-family="Arial" font-size="14" font-weight="900" fill="red">
        BEAM ADJUSTMENTS REQUIRED
      </text>
    `;
  }

  // Stations
  pts.forEach((p, i) => {
    const x = xForFt(p.stationFt);
    const y1 = railTopY + 14;
    const y2 = railBotY;

    const isFail = fails[i];
    const vAbs = Math.abs(p.valueIn);
    const valueLabel = nearestFractionStringInches(vAbs);
    const corr = correctionText(p.valueIn);

    // station bubble label: show station ft
    const stationLabel = `${Math.round(p.stationFt)}'`;

    svg += `
      <!-- Station ${i} -->
      <g>
        <circle cx="${x}" cy="${stationBubbleY}" r="12" fill="white" stroke="black" stroke-width="2"/>
        <text x="${x}" y="${stationBubbleY+4}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700">${esc(stationLabel)}</text>

        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"
              stroke="black" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/>

        <rect x="${x-30}" y="${(y1+y2)/2 - 12}" width="60" height="24"
              fill="white" stroke="${isFail ? "red" : "black"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <text x="${x}" y="${(y1+y2)/2 + 6}" text-anchor="middle"
              font-family="Arial" font-size="12" font-weight="800" fill="${isFail ? "red" : "black"}">${esc(valueLabel)}</text>
    `;

    if (isFail && corr) {
      svg += `
        <rect x="${x-38}" y="${railTopY-52}" width="76" height="22" fill="white" stroke="red" stroke-width="2"/>
        <text x="${x}" y="${railTopY-36}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="900" fill="red">${esc(corr)}</text>
      `;
    }

    svg += `</g>`;
  });

  svg += `</svg>`;
  return svg;
}

function renderRunwayDiagramToPage() {
  // If diagram UI isn't present, skip (no crash).
  if (!runwaySvg) return;

  latestDiagramSvgString = buildRunwayDiagramSvgString();
  // Replace the SVG element itself with new markup (keep same container)
  runwaySvg.outerHTML = latestDiagramSvgString;

  // After outerHTML replacement, runwaySvg reference is stale; reacquire if needed
}

/* ---------------- PDF export (print popup) ---------------- */

function exportPdfReport() {
  if (!latestRows.length) {
    summary.textContent = "Run a compliance check first, then export to PDF.";
    return;
  }

  // Ensure we have latest diagram SVG for export
  // (If user never clicked Render Diagram, we still build it from inputs)
  latestDiagramSvgString = buildRunwayDiagramSvgString();

  const projectName = document.getElementById("projectName")?.value || "Unnamed Project";
  const generatedAt = new Date().toLocaleString();

  const rowsHtml = latestRows
    .map(
      (row) => `
      <tr>
        <td>${row.check}</td>
        <td>${row.measuredText}</td>
        <td>${row.allowedText}</td>
        <td>${row.pass ? "PASS" : "FAIL"}</td>
        <td>${row.reference}</td>
      </tr>`
    )
    .join("");

  const suggestionHtml = suggestionList ? suggestionList.innerHTML : "<li>No suggestions panel enabled.</li>";

  const popup = window.open("", "_blank");
  if (!popup) {
    summary.textContent = "Popup blocked. Please allow popups to export PDF.";
    return;
  }

  popup.document.write(`
    <html>
      <head>
        <title>Compliance Report - ${projectName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; font-size: 12px; vertical-align: top; }
          h1 { margin: 0 0 6px; }
          .meta { color: #444; margin-bottom: 10px; }
          .diagramWrap { margin: 14px 0 18px; border: 1px solid #ccc; padding: 10px; border-radius: 8px; }
          .note { font-size: 11px; color:#333; margin-top: 6px; }
          @media print {
            .diagramWrap { break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; break-after: auto; }
          }
        </style>
      </head>
      <body>
        <h1>Big G Steel LLC - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${projectName}<br><strong>Generated:</strong> ${generatedAt}</div>

        <div class="diagramWrap">
          <h2 style="margin:0 0 8px;">Runway Markup Diagram</h2>
          ${latestDiagramSvgString}
          <div class="note">
            Diagram is generated from field station inputs. Cross-level values represent TOP OF RAIL to TOP OF RAIL elevation difference.
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Check</th><th>Measured</th><th>Allowed</th><th>Status</th><th>Reference</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <h2>Engineering Adjustment Suggestions</h2>
        <ul>${suggestionHtml}</ul>
      </body>
    </html>
  `);

  popup.document.close();
  popup.focus();
  popup.print();
}

/* ---------------- Run compliance ---------------- */

function runCompliance() {
  const profile = activeProfile();
  const rows = [];

  profile.checks.forEach((check) => {
    const values = collectValues(check);
    const result = check.evaluate(values);
    rows.push({
      check: check.label,
      measuredText: result.measuredText,
      allowedText: result.allowedText,
      pass: result.pass,
      reference: check.reference,
    });
  });

  rows.push(...evaluateElevationRows());
  latestRows = rows;

  renderSuggestions(rows);

  // Update on-page diagram automatically after compliance check (if diagram exists)
  latestDiagramSvgString = buildRunwayDiagramSvgString();
  if (runwaySvg) {
    runwaySvg.outerHTML = latestDiagramSvgString;
  }

  const passed = rows.filter((row) => row.pass).length;

  resultBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.check}</td>
        <td>${row.measuredText}</td>
        <td>${row.allowedText}</td>
        <td class="status ${row.pass ? "pass" : "fail"}">${row.pass ? "PASS" : "FAIL"}</td>
        <td>${row.reference}</td>
      </tr>`
    )
    .join("");

  summary.textContent = `${passed} of ${rows.length} checks passed for profile: ${profileSelect.value}.`;
}

/* ---------------- Event wiring + init ---------------- */

function init() {
  if (!assertRequiredDom()) return;

  profileSelect.addEventListener("change", () => {
    renderForm();
    resultBody.innerHTML = "";
    summary.textContent = "Inputs updated. Run the compliance check.";
  });

  buildLayoutBtn.addEventListener("click", () => {
    buildLayout();
    // After layout changes, rebuild diagram string (if diagram area exists)
    latestDiagramSvgString = buildRunwayDiagramSvgString();
    if (runwaySvg) runwaySvg.outerHTML = latestDiagramSvgString;
  });

  runBtn.addEventListener("click", runCompliance);
  exportPdfBtn.addEventListener("click", exportPdfReport);

  // Optional explicit diagram render button
  if (renderDiagramBtn) {
    renderDiagramBtn.addEventListener("click", () => {
      latestDiagramSvgString = buildRunwayDiagramSvgString();
      if (runwaySvg) runwaySvg.outerHTML = latestDiagramSvgString;
    });
  }

  buildProfileOptions();
  profileSelect.value = Object.keys(profiles)[0];
  renderForm();
  buildLayout();

  // If diagram exists, render initial blank diagram
  latestDiagramSvgString = buildRunwayDiagramSvgString();
  if (runwaySvg) runwaySvg.outerHTML = latestDiagramSvgString;
}

window.addEventListener("load", init);
