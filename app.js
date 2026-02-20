/* app.js — Big G Steel LLC TR-13 / CMAA field check
   Includes:
   - Core TR-13/CMAA checks
   - Layout builder
   - Cross-level markup SVG diagram (TOP OF RAIL to TOP OF RAIL)
   - Survey CSV import (station-by-station) for:
       * Straightness plots (Rail N / Rail S)
       * Eccentricity plots (Rail vs Beam) with tolerance zones
   - Export-to-PDF popup includes diagrams + charts (as inline SVG)
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
        label: "Runway centerline straightness offset (single value)",
        reference: "TR-13 straightness check (field quick check)",
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

const suggestionList = document.getElementById("suggestionList");
const exportPdfBtn = document.getElementById("exportPdf");

// Survey / charts UI
const surveyCsvEl = document.getElementById("surveyCsv");
const parseSurveyBtn = document.getElementById("parseSurvey");
const clearSurveyBtn = document.getElementById("clearSurvey");
const surveyStatusEl = document.getElementById("surveyStatus");
const straightnessSvgEl = document.getElementById("straightnessSvg");
const eccentricitySvgEl = document.getElementById("eccentricitySvg");
const surveyStraightTolEl = document.getElementById("surveyStraightTol");
const surveyRateTolPer20El = document.getElementById("surveyRateTolPer20");
const eccZonesEl = document.getElementById("eccZones");

let latestRows = [];
let latestCrossLevelDiagramSvg = "";
let latestStraightnessChartSvg = "";
let latestEccentricityChartSvg = "";

// Parsed survey data state
let surveyData = null; // { stationFt[], railN[], railS[], beamN[], beamS[] }

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
    console.error("Missing DOM elements:", missing);
    if (summary) {
      summary.textContent =
        `App error: Missing required elements (${missing.join(", ")}). Verify index.html IDs match app.js.`;
    }
    return false;
  }
  return true;
}

/* ---------------- Utilities ---------------- */

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nearestFractionStringInches(valueIn) {
  const abs = Math.abs(toNum(valueIn, 0));
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

  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 0);

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
    fieldset.innerHTML = `<legend>${escHtml(side.label)} column-to-column distances (ft)</legend>`;

    for (let segment = 1; segment < columns; segment += 1) {
      const designLabel = document.createElement("label");
      designLabel.innerHTML = `${escHtml(side.label)} Column ${segment} to ${escHtml(side.label)} Column ${segment + 1} designed distance (ft)
        <input type="number" step="any" min="0" id="${side.key}_design_distance_${segment}" value="60" />`;
      fieldset.append(designLabel);

      const actualLabel = document.createElement("label");
      actualLabel.innerHTML = `${escHtml(side.label)} Column ${segment} to ${escHtml(side.label)} Column ${segment + 1} actual distance (ft)
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
      const designDistance = toNum(
        document.getElementById(`${side.key}_design_distance_${segment}`)?.value ?? 60,
        60
      );

      stationOffsets(designDistance, measuredStationDistance).forEach((offset) => {
        const label = document.createElement("label");
        label.innerHTML = `${escHtml(side.label)} Column ${segment} to ${escHtml(side.label)} Column ${segment + 1} elevation from Baseline at ${offset} ft station (in)
          <input type="number" step="any" id="${side.key}_segment_${segment}_station_${offset}" value="0" />`;
        sideMeasurements.append(label);
      });
    }
  });
  layoutContainer.append(sideMeasurements);

  // Cross-level measurements between sides
  const crossLevelMeasurements = document.createElement("fieldset");
  crossLevelMeasurements.className = "grid";
  crossLevelMeasurements.innerHTML = `<legend>${escHtml(sides[0].label)} to ${escHtml(sides[1].label)} CROSS-LEVEL measurements (TOP OF RAIL to TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>`;

  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = toNum(
      document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 60,
      60
    );
    const sideBDesignDistance = toNum(
      document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 60,
      60
    );

    stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance).forEach(
      (offset) => {
        const label = document.createElement("label");
        label.innerHTML = `${escHtml(sides[0].label)}${segment} to ${escHtml(sides[1].label)}${segment} cross-level at ${offset} ft station (in)
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
    acc[input.id] = toNum(el?.value, 0);
    return acc;
  }, {});
}

function evaluateElevationRows() {
  const sides = sideConfig();
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);

  const baselineTol = toNum(document.getElementById("baselineTol")?.value, 0.125);
  const crossLevelTol = toNum(document.getElementById("crossLevelTol")?.value, 0.375);
  const columnDistanceTol = toNum(document.getElementById("columnDistanceTol")?.value, 0.25);

  const rows = [];

  // Side checks
  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const designDistance = toNum(document.getElementById(`${side.key}_design_distance_${segment}`)?.value, 0);
      const actualDistance = toNum(document.getElementById(`${side.key}_actual_distance_${segment}`)?.value, 0);

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
          toNum(document.getElementById(`${side.key}_segment_${segment}_station_${offset}`)?.value, 0)
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

  // Cross-level checks
  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = toNum(document.getElementById(`sideA_design_distance_${segment}`)?.value, 0);
    const sideBDesignDistance = toNum(document.getElementById(`sideB_design_distance_${segment}`)?.value, 0);

    const offsets = stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance);

    offsets.forEach((offset) => {
      const crossLevelValue = Math.abs(
        toNum(document.getElementById(`cross_segment_${segment}_station_${offset}`)?.value, 0)
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
    .map((row) => `<li><strong>${escHtml(row.check)}:</strong> ${escHtml(suggestionForRow(row))}</li>`)
    .join("");
}

/* ---------------- Cross-level markup diagram SVG ---------------- */

function collectCrossLevelSeries() {
  const sides = sideConfig();
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);

  const pts = [];
  let cumulativeFt = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = toNum(document.getElementById(`sideA_design_distance_${segment}`)?.value, 0);
    const sideBDesignDistance = toNum(document.getElementById(`sideB_design_distance_${segment}`)?.value, 0);
    const segmentLenFt = Math.min(sideADesignDistance, sideBDesignDistance);

    const offsets = stationOffsets(segmentLenFt, measuredStationDistance);
    offsets.forEach((offsetFt) => {
      const v = toNum(document.getElementById(`cross_segment_${segment}_station_${offsetFt}`)?.value, 0);
      pts.push({
        stationFt: cumulativeFt + offsetFt,
        valueIn: v,
        segment,
        localOffsetFt: offsetFt,
        pairLabel: `${sides[0].label}${segment}–${sides[1].label}${segment}`,
      });
    });

    cumulativeFt += segmentLenFt;
  }

  return pts;
}

function buildCrossLevelDiagramSvgString() {
  const sides = sideConfig();
  const tol = toNum(document.getElementById("crossLevelTol")?.value, 0.375);

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

  // Conservative correction (amount out of tolerance)
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

    <g>
      <circle cx="55" cy="${railTopY+7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railTopY+12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[0].label[0] || "A")}</text>

      <circle cx="55" cy="${railBotY+7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railBotY+12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[1].label[0] || "B")}</text>
    </g>

    <rect x="${marginL}" y="${railTopY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    <rect x="${marginL}" y="${railBotY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>

    <text x="${marginL}" y="32" font-family="Arial" font-size="18" font-weight="800">CROSS-LEVEL MARKUP (TOP OF RAIL to TOP OF RAIL)</text>
    <text x="${marginL}" y="54" font-family="Arial" font-size="12">Tolerance: ≤ ${tol.toFixed(3)} in (TR-13)</text>
  `;

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

  pts.forEach((p, i) => {
    const x = xForFt(p.stationFt);
    const y1 = railTopY + 14;
    const y2 = railBotY;

    const isFail = fails[i];
    const vAbs = Math.abs(p.valueIn);
    const valueLabel = nearestFractionStringInches(vAbs);
    const corr = correctionText(p.valueIn);
    const stationLabel = `${Math.round(p.stationFt)}'`;

    svg += `
      <g>
        <circle cx="${x}" cy="${stationBubbleY}" r="12" fill="white" stroke="black" stroke-width="2"/>
        <text x="${x}" y="${stationBubbleY+4}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700">${escHtml(stationLabel)}</text>

        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"
              stroke="black" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/>

        <rect x="${x-30}" y="${(y1+y2)/2 - 12}" width="60" height="24"
              fill="white" stroke="${isFail ? "red" : "black"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <text x="${x}" y="${(y1+y2)/2 + 6}" text-anchor="middle"
              font-family="Arial" font-size="12" font-weight="800" fill="${isFail ? "red" : "black"}">${escHtml(valueLabel)}</text>
    `;

    if (isFail && corr) {
      svg += `
        <rect x="${x-38}" y="${railTopY-52}" width="76" height="22" fill="white" stroke="red" stroke-width="2"/>
        <text x="${x}" y="${railTopY-36}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="900" fill="red">${escHtml(corr)}</text>
      `;
    }

    svg += `</g>`;
  });

  svg += `</svg>`;
  return svg;
}

/* ---------------- Survey CSV import ---------------- */

function parseCsv(text) {
  // Basic CSV parser for paste-from-Excel:
  // - supports commas
  // - ignores blank lines
  // - trims cells
  // - does not handle quoted commas (can be added if you need)
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(",").map(c => c.trim()));
  return { headers, rows };
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function parseSurveyDataFromTextarea() {
  if (!surveyCsvEl) return null;

  const { headers, rows } = parseCsv(surveyCsvEl.value);
  if (!headers.length || !rows.length) return null;

  const idx = {};
  headers.forEach((h, i) => {
    idx[normalizeHeader(h)] = i;
  });

  // Required
  const stationKey = "stationft";
  const railNKey = "railn";
  const railSKey = "rails";

  if (!(stationKey in idx) || !(railNKey in idx) || !(railSKey in idx)) {
    throw new Error("CSV must include headers: StationFt, RailN, RailS (BeamN/BeamS optional).");
  }

  const stationFt = [];
  const railN = [];
  const railS = [];
  const beamN = [];
  const beamS = [];

  const hasBeamN = ("beamn" in idx);
  const hasBeamS = ("beams" in idx);

  for (const r of rows) {
    const st = toNum(r[idx[stationKey]], NaN);
    const rn = toNum(r[idx[railNKey]], NaN);
    const rs = toNum(r[idx[railSKey]], NaN);

    if (!Number.isFinite(st) || !Number.isFinite(rn) || !Number.isFinite(rs)) continue;

    stationFt.push(st);
    railN.push(rn);
    railS.push(rs);

    beamN.push(hasBeamN ? toNum(r[idx["beamn"]], 0) : null);
    beamS.push(hasBeamS ? toNum(r[idx["beams"]], 0) : null);
  }

  if (stationFt.length < 2) {
    throw new Error("Not enough valid rows parsed. Need at least 2 stations.");
  }

  // Sort by station
  const order = stationFt
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)
    .map(o => o.i);

  const sorted = (arr) => order.map(i => arr[i]);

  return {
    stationFt: sorted(stationFt),
    railN: sorted(railN),
    railS: sorted(railS),
    beamN: sorted(beamN),
    beamS: sorted(beamS),
    hasBeam: hasBeamN && hasBeamS,
  };
}

function parseEccZones() {
  // Lines: start,end,tol
  if (!eccZonesEl) return null;

  const lines = String(eccZonesEl.value || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const zones = [];
  for (const line of lines) {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 3) continue;
    const startFt = toNum(parts[0], NaN);
    const endFt = toNum(parts[1], NaN);
    const tolIn = toNum(parts[2], NaN);
    if (!Number.isFinite(startFt) || !Number.isFinite(endFt) || !Number.isFinite(tolIn)) continue;
    zones.push({ startFt, endFt, tolIn });
  }
  return zones.length ? zones : null;
}

/* ---------------- Chart calculations ---------------- */

function seriesMaxAbs(y) {
  let m = 0;
  for (const v of y) m = Math.max(m, Math.abs(v));
  return m;
}

function rateOfChangePer20ft(stationFt, y) {
  // For each point i, compare to previous point j such that distance is closest to 20ft (or nearest available)
  // Compute per-20ft normalized rate: |dy| * (20 / dx)
  const out = [];
  for (let i = 0; i < y.length; i++) {
    let bestJ = -1;
    let bestDx = Infinity;

    for (let j = 0; j < y.length; j++) {
      if (j === i) continue;
      const dx = Math.abs(stationFt[i] - stationFt[j]);
      if (dx <= 0) continue;
      const diffTo20 = Math.abs(dx - 20);
      if (diffTo20 < bestDx) {
        bestDx = diffTo20;
        bestJ = j;
      }
    }

    if (bestJ === -1) {
      out.push(0);
      continue;
    }

    const dx = Math.abs(stationFt[i] - stationFt[bestJ]);
    const dy = Math.abs(y[i] - y[bestJ]);
    const per20 = dy * (20 / dx);
    out.push(per20);
  }
  return out;
}

/* ---------------- SVG chart rendering ---------------- */

function buildChartSvg({
  title,
  subtitleLeft,
  subtitleRight,
  stationFt,
  series,            // [{ name, y[], style }]
  yMin,
  yMax,
  tolWindow,         // { type: "constant", tolIn } OR { type:"zones", zones:[{startFt,endFt,tolIn}] }
  highlightMax = true
}) {
  const W = 1100, H = 360;
  const margin = { l: 70, r: 40, t: 60, b: 50 };
  const plotW = W - margin.l - margin.r;
  const plotH = H - margin.t - margin.b;

  const xMin = Math.min(...stationFt);
  const xMax = Math.max(...stationFt);
  const xSpan = Math.max(1e-6, xMax - xMin);

  const xToPx = (x) => margin.l + ((x - xMin) / xSpan) * plotW;
  const yToPx = (y) => margin.t + (1 - ((y - yMin) / (yMax - yMin))) * plotH;

  // Build tolerance bounds arrays aligned to station
  const upper = [];
  const lower = [];

  function tolAt(ft) {
    if (!tolWindow) return 0;
    if (tolWindow.type === "constant") return tolWindow.tolIn;
    if (tolWindow.type === "zones") {
      const z = tolWindow.zones.find(z => ft >= z.startFt && ft <= z.endFt);
      return z ? z.tolIn : tolWindow.zones[tolWindow.zones.length - 1]?.tolIn ?? 0;
    }
    return 0;
  }

  for (let i = 0; i < stationFt.length; i++) {
    const t = tolAt(stationFt[i]);
    upper.push(t);
    lower.push(-t);
  }

  // Gridlines: x every 50ft, y every 0.5in by default
  const xGridStep = 50;
  const yGridStep = 0.5;

  const svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
    <text x="${margin.l}" y="26" font-family="Arial" font-size="18" font-weight="800">${escHtml(title)}</text>
    <text x="${margin.l}" y="46" font-family="Arial" font-size="12">${escHtml(subtitleLeft || "")}</text>
    <text x="${W - margin.r}" y="46" font-family="Arial" font-size="12" text-anchor="end">${escHtml(subtitleRight || "")}</text>
  `);

  // Plot box
  svgParts.push(`<rect x="${margin.l}" y="${margin.t}" width="${plotW}" height="${plotH}" fill="white" stroke="black" stroke-width="1"/>`);

  // X grid
  for (let x = Math.ceil(xMin / xGridStep) * xGridStep; x <= xMax; x += xGridStep) {
    const px = xToPx(x);
    svgParts.push(`<line x1="${px}" y1="${margin.t}" x2="${px}" y2="${margin.t + plotH}" stroke="#999" stroke-width="0.5" stroke-dasharray="4 4"/>`);
    svgParts.push(`<text x="${px}" y="${margin.t + plotH + 18}" font-family="Arial" font-size="10" text-anchor="middle">${x}</text>`);
  }
  svgParts.push(`<text x="${margin.l}" y="${margin.t + plotH + 38}" font-family="Arial" font-size="10">ft</text>`);

  // Y grid + labels
  for (let y = Math.ceil(yMin / yGridStep) * yGridStep; y <= yMax; y += yGridStep) {
    const py = yToPx(y);
    svgParts.push(`<line x1="${margin.l}" y1="${py}" x2="${margin.l + plotW}" y2="${py}" stroke="#ddd" stroke-width="0.7"/>`);
    svgParts.push(`<text x="${margin.l - 10}" y="${py + 3}" font-family="Arial" font-size="10" text-anchor="end">${y.toFixed(1)}</text>`);
  }
  svgParts.push(`<text x="${margin.l - 40}" y="${margin.t - 10}" font-family="Arial" font-size="10">in</text>`);

  // Tolerance window lines (dotted)
  const tolPath = (arr) => arr.map((t, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(t)}`).join(" ");
  if (tolWindow) {
    svgParts.push(`<path d="${tolPath(upper)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    svgParts.push(`<path d="${tolPath(lower)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
  }

  // Plot series
  function polyPath(yArr) {
    return yArr.map((yy, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(yy)}`).join(" ");
  }

  series.forEach((s) => {
    const stroke = s.style?.stroke || "black";
    const width = s.style?.width || 2.5;
    const dash = s.style?.dash || "";
    svgParts.push(`<path d="${polyPath(s.y)}" fill="none" stroke="${stroke}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`);
  });

  // Highlight max deviation points per series (rail only typically)
  if (highlightMax && series.length) {
    series.forEach((s) => {
      const yArr = s.y;
      let maxIdx = 0;
      let maxAbs = 0;
      for (let i = 0; i < yArr.length; i++) {
        const a = Math.abs(yArr[i]);
        if (a > maxAbs) {
          maxAbs = a;
          maxIdx = i;
        }
      }
      const px = xToPx(stationFt[maxIdx]);
      const py = yToPx(yArr[maxIdx]);
      svgParts.push(`<circle cx="${px}" cy="${py}" r="4" fill="red"/>`);
      svgParts.push(`<text x="${px + 8}" y="${py - 8}" font-family="Arial" font-size="10" fill="black">${maxAbs.toFixed(2)} in</text>`);
    });
  }

  // Legend (simple)
  const legendX = margin.l + 10;
  let legendY = margin.t + plotH + 8;
  series.forEach((s, i) => {
    const y = legendY + (i * 16);
    svgParts.push(`<line x1="${legendX}" y1="${y}" x2="${legendX + 30}" y2="${y}" stroke="${s.style?.stroke || "black"}" stroke-width="${s.style?.width || 2.5}" ${s.style?.dash ? `stroke-dasharray="${s.style.dash}"` : ""}/>`);
    svgParts.push(`<text x="${legendX + 36}" y="${y + 4}" font-family="Arial" font-size="11">${escHtml(s.name)}</text>`);
  });
  if (tolWindow) {
    const y = legendY + (series.length * 16);
    svgParts.push(`<line x1="${legendX}" y1="${y}" x2="${legendX + 30}" y2="${y}" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    svgParts.push(`<text x="${legendX + 36}" y="${y + 4}" font-family="Arial" font-size="11">Tolerance Window</text>`);
  }

  svgParts.push(`</svg>`);
  return svgParts.join("");
}

function buildStraightnessCharts() {
  if (!surveyData) return { svg: emptySvg("No survey data."), stats: null };

  const stationFt = surveyData.stationFt;
  const railN = surveyData.railN;
  const railS = surveyData.railS;

  const tol = toNum(surveyStraightTolEl?.value, 0.375);
  const rateTol = toNum(surveyRateTolPer20El?.value, 0.25);

  const maxDevN = seriesMaxAbs(railN);
  const maxDevS = seriesMaxAbs(railS);

  const rateN = rateOfChangePer20ft(stationFt, railN);
  const rateS = rateOfChangePer20ft(stationFt, railS);
  const maxRateN = Math.max(...rateN);
  const maxRateS = Math.max(...rateS);

  // Y range: expand a bit beyond max of rail and tol
  const yAbsMax = Math.max(maxDevN, maxDevS, tol) * 1.25 || 1;
  const yMin = -yAbsMax;
  const yMax = yAbsMax;

  const lengthFt = (Math.max(...stationFt) - Math.min(...stationFt));

  // Build ONE SVG that shows both N and S stacked? Your sample uses two plots.
  // To keep it simple and clean inside your app, we produce a combined chart with both lines.
  // If you want two separate charts later, I can split them.
  const svg = buildChartSvg({
    title: "Straightness - Rail (Station-by-Station)",
    subtitleLeft: `Runway Length: ${lengthFt.toFixed(0)} ft   |   Tolerance: ±${nearestFractionStringInches(tol)}`,
    subtitleRight: `Max Dev N: ${maxDevN.toFixed(3)} in  |  Max Dev S: ${maxDevS.toFixed(3)} in`,
    stationFt,
    series: [
      { name: "Rail Center - Column Line N", y: railN, style: { stroke: "black", width: 2.5 } },
      { name: "Rail Center - Column Line S", y: railS, style: { stroke: "#333", width: 2.5, dash: "6 4" } },
    ],
    yMin,
    yMax,
    tolWindow: { type: "constant", tolIn: tol },
    highlightMax: true
  });

  const stats = {
    runwayLengthFt: lengthFt,
    tolIn: tol,
    rateTolPer20: rateTol,
    maxDevN,
    maxDevS,
    maxRateN,
    maxRateS,
  };

  return { svg, stats };
}

function buildEccentricityChart() {
  if (!surveyData) return { svg: emptySvg("No survey data."), stats: null };

  const stationFt = surveyData.stationFt;
  const railN = surveyData.railN;
  const beamN = surveyData.beamN;

  // If beam is missing, can't compute eccentricity
  const hasBeamN = beamN && beamN.some(v => v !== null && Number.isFinite(v));
  if (!hasBeamN) {
    return { svg: emptySvg("Eccentricity requires BeamN/BeamS. Provide BeamN & BeamS columns in CSV."), stats: null };
  }

  // Eccentricity: rail - beam (N line only for now, matching your sample “Column Line N” page)
  const eccN = railN.map((v, i) => v - toNum(beamN[i], 0));

  const zones = parseEccZones();
  const maxDev = seriesMaxAbs(eccN);

  // Default y range
  const tolFallback = 0.75;
  const maxTol = zones ? Math.max(...zones.map(z => z.tolIn)) : tolFallback;
  const yAbsMax = Math.max(maxDev, maxTol) * 1.25 || 1;
  const yMin = -yAbsMax;
  const yMax = yAbsMax;

  const lengthFt = (Math.max(...stationFt) - Math.min(...stationFt));

  const tolWindow = zones
    ? { type: "zones", zones }
    : { type: "constant", tolIn: tolFallback };

  const svg = buildChartSvg({
    title: "Runway/Rail Eccentricity - Column Line N",
    subtitleLeft: `Runway Length: ${lengthFt.toFixed(0)} ft`,
    subtitleRight: `Max Deviation: ${maxDev.toFixed(3)} in`,
    stationFt,
    series: [
      { name: "Beam/Rail Eccentricity (Rail - Beam)", y: eccN, style: { stroke: "black", width: 2.5 } }
    ],
    yMin,
    yMax,
    tolWindow,
    highlightMax: true
  });

  const stats = { runwayLengthFt: lengthFt, maxDev, zones };

  return { svg, stats };
}

function emptySvg(msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="360" viewBox="0 0 1100 360">
    <rect x="0" y="0" width="1100" height="360" fill="white"/>
    <text x="40" y="60" font-family="Arial" font-size="16" font-weight="700">${escHtml(msg)}</text>
  </svg>`;
}

function renderSurveyCharts() {
  // Render straightness chart
  const s = buildStraightnessCharts();
  latestStraightnessChartSvg = s.svg;
  if (straightnessSvgEl) straightnessSvgEl.outerHTML = latestStraightnessChartSvg;

  // Render eccentricity chart
  const e = buildEccentricityChart();
  latestEccentricityChartSvg = e.svg;
  if (eccentricitySvgEl) eccentricitySvgEl.outerHTML = latestEccentricityChartSvg;

  // Status
  if (surveyStatusEl) {
    if (!surveyData) {
      surveyStatusEl.textContent = "No survey data parsed yet.";
      return;
    }
    const n = surveyData.stationFt.length;
    const hasBeam = surveyData.hasBeam ? "Yes" : "No";
    surveyStatusEl.textContent = `Survey parsed: ${n} stations. Beam data present: ${hasBeam}. Charts updated.`;
  }
}

/* ---------------- PDF export ---------------- */

function exportPdfReport() {
  if (!latestRows.length) {
    summary.textContent = "Run a compliance check first, then export to PDF.";
    return;
  }

  // Ensure latest SVGs are built
  latestCrossLevelDiagramSvg = buildCrossLevelDiagramSvgString();
  if (surveyData) {
    latestStraightnessChartSvg = buildStraightnessCharts().svg;
    latestEccentricityChartSvg = buildEccentricityChart().svg;
  } else {
    latestStraightnessChartSvg = "";
    latestEccentricityChartSvg = "";
  }

  const projectName = document.getElementById("projectName")?.value || "Unnamed Project";
  const generatedAt = new Date().toLocaleString();

  const rowsHtml = latestRows
    .map(
      (row) => `
      <tr>
        <td>${escHtml(row.check)}</td>
        <td>${escHtml(row.measuredText)}</td>
        <td>${escHtml(row.allowedText)}</td>
        <td>${row.pass ? "PASS" : "FAIL"}</td>
        <td>${escHtml(row.reference)}</td>
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
        <title>Compliance Report - ${escHtml(projectName)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; font-size: 12px; vertical-align: top; }
          h1 { margin: 0 0 6px; }
          .meta { color: #444; margin-bottom: 10px; }
          .box { margin: 14px 0 18px; border: 1px solid #ccc; padding: 10px; border-radius: 8px; }
          .note { font-size: 11px; color:#333; margin-top: 6px; }
          @media print {
            .box { break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; break-after: auto; }
          }
        </style>
      </head>
      <body>
        <h1>Big G Steel LLC - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${escHtml(projectName)}<br><strong>Generated:</strong> ${escHtml(generatedAt)}</div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Cross-Level Markup Diagram</h2>
          ${latestCrossLevelDiagramSvg}
          <div class="note">Cross-level is TOP OF RAIL to TOP OF RAIL (TR-13 intent). Red indicates out-of-tolerance conditions.</div>
        </div>

        ${surveyData ? `
        <div class="box">
          <h2 style="margin:0 0 8px;">Straightness - Rail</h2>
          ${latestStraightnessChartSvg}
        </div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Runway/Rail Eccentricity</h2>
          ${latestEccentricityChartSvg}
        </div>
        ` : ""}

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

  // Update results table
  const passed = rows.filter((row) => row.pass).length;

  resultBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${escHtml(row.check)}</td>
        <td>${escHtml(row.measuredText)}</td>
        <td>${escHtml(row.allowedText)}</td>
        <td class="status ${row.pass ? "pass" : "fail"}">${row.pass ? "PASS" : "FAIL"}</td>
        <td>${escHtml(row.reference)}</td>
      </tr>`
    )
    .join("");

  summary.textContent = `${passed} of ${rows.length} checks passed for profile: ${profileSelect.value}.`;

  // Always rebuild cross-level diagram for export
  latestCrossLevelDiagramSvg = buildCrossLevelDiagramSvgString();
}

/* ---------------- Event wiring + init ---------------- */

function init() {
  if (!assertRequiredDom()) return;

  profileSelect.addEventListener("change", () => {
    renderForm();
    resultBody.innerHTML = "";
    summary.textContent = "Inputs updated. Run the compliance check.";
  });

  buildLayoutBtn.addEventListener("click", buildLayout);
  runBtn.addEventListener("click", runCompliance);
  exportPdfBtn.addEventListener("click", exportPdfReport);

  // Survey: parse + render
  if (parseSurveyBtn) {
    parseSurveyBtn.addEventListener("click", () => {
      try {
        surveyData = parseSurveyDataFromTextarea();
        if (!surveyData) {
          surveyData = null;
          if (surveyStatusEl) surveyStatusEl.textContent = "No survey data found. Paste CSV with StationFt,RailN,RailS.";
          if (straightnessSvgEl) straightnessSvgEl.outerHTML = emptySvg("No survey data.");
          if (eccentricitySvgEl) eccentricitySvgEl.outerHTML = emptySvg("No survey data.");
          return;
        }
        renderSurveyCharts();
      } catch (err) {
        surveyData = null;
        if (surveyStatusEl) surveyStatusEl.textContent = `Survey parse error: ${err.message}`;
        if (straightnessSvgEl) straightnessSvgEl.outerHTML = emptySvg(`Parse error: ${err.message}`);
        if (eccentricitySvgEl) eccentricitySvgEl.outerHTML = emptySvg(`Parse error: ${err.message}`);
      }
    });
  }

  if (clearSurveyBtn) {
    clearSurveyBtn.addEventListener("click", () => {
      surveyData = null;
      if (surveyCsvEl) surveyCsvEl.value = "";
      if (surveyStatusEl) surveyStatusEl.textContent = "Survey cleared.";
      if (straightnessSvgEl) straightnessSvgEl.outerHTML = emptySvg("No survey data.");
      if (eccentricitySvgEl) eccentricitySvgEl.outerHTML = emptySvg("No survey data.");
    });
  }

  // If tolerance settings change, re-render charts if data exists
  [surveyStraightTolEl, surveyRateTolPer20El, eccZonesEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      if (surveyData) renderSurveyCharts();
    });
  });

  buildProfileOptions();
  profileSelect.value = Object.keys(profiles)[0];
  renderForm();
  buildLayout();

  // Initialize chart placeholders
  if (straightnessSvgEl) straightnessSvgEl.outerHTML = emptySvg("No survey data.");
  if (eccentricitySvgEl) eccentricitySvgEl.outerHTML = emptySvg("No survey data.");
}

window.addEventListener("load", init);
