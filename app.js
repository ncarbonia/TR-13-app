/* app.js — Big G Steel TR-13 / CMAA field check */

const profiles = {
  "CMAA 70 / 74 + TR-13 (field defaults)": {
    checks: [
      {
        id: "runwayStraightness",
        label: "Runway centerline straightness offset (single value)",
        reference: "TR-13 straightness check (quick field check)",
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

/* ---------------- DOM ---------------- */

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

const surveyRunwayLengthFtEl = document.getElementById("surveyRunwayLengthFt");
const surveyStationSpacingFtEl = document.getElementById("surveyStationSpacingFt");
const surveyStartFtEl = document.getElementById("surveyStartFt");
const surveyStraightTolEl = document.getElementById("surveyStraightTol");
const surveyRateTolPer20El = document.getElementById("surveyRateTolPer20");
const surveyUseBeamEl = document.getElementById("surveyUseBeam");
const beamWebThicknessEl = document.getElementById("beamWebThickness");
const eccZonesEl = document.getElementById("eccZones");

const buildSurveyStationsBtn = document.getElementById("buildSurveyStations");
const evaluateSurveyBtn = document.getElementById("evaluateSurvey");
const surveyStatusEl = document.getElementById("surveyStatus");

const surveyTable = document.getElementById("surveyTable");
const surveyTbody = surveyTable ? surveyTable.querySelector("tbody") : null;

const straightnessSvgEl = document.getElementById("straightnessSvg");
const eccentricitySvgEl = document.getElementById("eccentricitySvg");

/* ---------------- State ---------------- */

let latestRows = [];
let latestCrossLevelDiagramSvg = "";
let latestStraightnessChartSvg = "";
let latestEccentricityChartSvg = "";

/* ---------------- Required DOM guard ---------------- */

const REQUIRED = [
  ["profileSelect", profileSelect],
  ["measurementForm", form],
  ["runCheck", runBtn],
  ["resultTable tbody", resultBody],
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
    console.error("App init failed. Missing DOM:", missing);
    if (summary) {
      summary.textContent = `App error: Missing required elements (${missing.join(", ")}).`;
    }
    return false;
  }
  return true;
}

/* ---------------- Utilities ---------------- */

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
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

function emptySvg(msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="360" viewBox="0 0 1100 360">
    <rect x="0" y="0" width="1100" height="360" fill="white"/>
    <text x="40" y="60" font-family="Arial" font-size="16" font-weight="700">${escHtml(msg)}</text>
  </svg>`;
}

function setSvgInner(svgEl, svgString) {
  if (!svgEl) return;
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  svgEl.innerHTML = doc.documentElement.innerHTML;
}

function seriesMaxAbs(y) {
  let m = 0;
  for (const v of y) m = Math.max(m, Math.abs(v));
  return m;
}

function parseZones(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const zones = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;

    const startFt = toNum(parts[0], NaN);
    const endFt = toNum(parts[1], NaN);
    const tolIn = toNum(parts[2], NaN);

    if ([startFt, endFt, tolIn].every(Number.isFinite)) {
      zones.push({ startFt, endFt, tolIn });
    }
  }
  return zones.length ? zones : null;
}

function stationOffsets(segmentDistanceFt, stationDistanceFt) {
  const offsets = [];
  for (let offset = 0; offset < segmentDistanceFt; offset += stationDistanceFt) {
    offsets.push(Number(offset.toFixed(3)));
  }
  return offsets;
}

function sideConfig() {
  const parts = String(directionPairInput.value || "North|South").split("|");
  const sideA = parts[0] || "North";
  const sideB = parts[1] || "South";

  return [
    { key: "sideA", label: sideA },
    { key: "sideB", label: sideB },
  ];
}

function getSegmentLengthFt(sideKey, segment) {
  return toNum(document.getElementById(`${sideKey}_actual_distance_${segment}`)?.value, 0);
}

function getSideElevationValue(sideKey, segment, offsetFt) {
  return toNum(document.getElementById(`${sideKey}_segment_${segment}_station_${offsetFt}`)?.value, 0);
}

function getRailToRailValue(segment, offsetFt) {
  const a = getSideElevationValue("sideA", segment, offsetFt);
  const b = getSideElevationValue("sideB", segment, offsetFt);
  return a - b;
}

function getSpanMeasurementValue(segment, offsetFt) {
  return toNum(document.getElementById(`span_segment_${segment}_station_${offsetFt}`)?.value, 0);
}

function getReferenceSpanValue() {
  return toNum(document.getElementById("referenceSpan")?.value, 0);
}

function getSpanToleranceValue() {
  return toNum(document.getElementById("spanTol")?.value, 0.25);
}

function getTotalRunwayLengthForSide(sideKey) {
  const columns = toNum(columnsPerSideInput.value, 0);
  let total = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    total += getSegmentLengthFt(sideKey, segment);
  }

  return total;
}

function autoPopulateSurveyRunwayLength() {
  if (!surveyRunwayLengthFtEl) return;

  const sideATotal = getTotalRunwayLengthForSide("sideA");
  const sideBTotal = getTotalRunwayLengthForSide("sideB");
  const runwayLength = Math.max(sideATotal, sideBTotal);

  if (runwayLength > 0) {
    surveyRunwayLengthFtEl.value = String(runwayLength);
  }
}

/* ---------------- Profiles / base form ---------------- */

function buildProfileOptions() {
  profileSelect.innerHTML = "";

  Object.keys(profiles).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    profileSelect.appendChild(option);
  });
}

function activeProfile() {
  return profiles[profileSelect.value];
}

function renderForm() {
  form.innerHTML = "";
  const profile = activeProfile();
  if (!profile) return;

  profile.checks.forEach((check) => {
    check.inputs.forEach((input) => {
      const label = document.createElement("label");
      label.innerHTML = `${escHtml(check.label)} — ${escHtml(input.label)}
        <input type="number" step="0.1" id="${check.id}_${input.id}" value="${input.value}" />`;
      form.appendChild(label);
    });
  });
}

/* ---------------- Layout generation ---------------- */

function buildLayout() {
  layoutContainer.innerHTML = "";

  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 0);

  if (columns < 2 || measuredStationDistance <= 0) {
    summary.textContent = "Columns per side must be 2+ and measured station distance must be > 0.";
    return;
  }

  const sides = sideConfig();

  // Actual distances
  sides.forEach((side) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "grid";
    fieldset.innerHTML = `<legend>${escHtml(side.label)} actual column-to-column distances (ft)</legend>`;

    for (let segment = 1; segment < columns; segment += 1) {
      const label = document.createElement("label");
      label.innerHTML = `${escHtml(side.label)} Column ${segment} to ${escHtml(side.label)} Column ${segment + 1} actual distance (ft)
        <input type="number" step="1" min="0" id="${side.key}_actual_distance_${segment}" value="60" />`;
      fieldset.appendChild(label);
    }

    layoutContainer.appendChild(fieldset);
  });

  // Side elevations
  const sideMeasurements = document.createElement("fieldset");
  sideMeasurements.className = "grid";
  sideMeasurements.innerHTML =
    `<legend>Side Elevation from Baseline (TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>`;

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment) || 60;
      stationOffsets(actualDistance, measuredStationDistance).forEach((offset) => {
        const label = document.createElement("label");
        label.innerHTML = `${escHtml(side.label)} Column ${segment} to ${escHtml(side.label)} Column ${segment + 1} elevation from Baseline at ${offset} ft station (in)
          <input type="number" step="0.1" id="${side.key}_segment_${segment}_station_${offset}" value="0" />`;
        sideMeasurements.appendChild(label);
      });
    }
  });
  layoutContainer.appendChild(sideMeasurements);

  // Rail to Rail
  const railToRailMeasurements = document.createElement("fieldset");
  railToRailMeasurements.className = "grid";
  railToRailMeasurements.innerHTML = `<legend>Rail to Rail Measurements</legend>`;

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment) || 60,
      getSegmentLengthFt("sideB", segment) || 60
    );

    stationOffsets(segmentLen, measuredStationDistance).forEach((offset) => {
      const label = document.createElement("label");
      label.innerHTML = `${escHtml(sides[0].label)}${segment} to ${escHtml(sides[1].label)}${segment} rail-to-rail at ${offset} ft station (in)
        <input type="number" step="0.001" id="rail_to_rail_segment_${segment}_station_${offset}" value="0" readonly class="readonlyCalc" />`;
      railToRailMeasurements.appendChild(label);
    });
  }
  layoutContainer.appendChild(railToRailMeasurements);

  // Span measurements
  const spanMeasurements = document.createElement("fieldset");
  spanMeasurements.className = "grid";
  spanMeasurements.innerHTML = `<legend>Span Measurements — compare each station to one reference span</legend>`;

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment) || 60,
      getSegmentLengthFt("sideB", segment) || 60
    );

    stationOffsets(segmentLen, measuredStationDistance).forEach((offset) => {
      const label = document.createElement("label");
      label.innerHTML = `Span measurement for segment ${segment} at ${offset} ft station (in)
        <input type="number" step="0.1" id="span_segment_${segment}_station_${offset}" value="0" />`;
      spanMeasurements.appendChild(label);
    });
  }
  layoutContainer.appendChild(spanMeasurements);

  // Tolerances
  const tolerances = document.createElement("fieldset");
  tolerances.className = "grid two-col";
  tolerances.innerHTML = `
    <legend>TR-13 checks and tolerances</legend>

    <label>
      Reference span (in)
      <input type="number" step="0.1" min="0" id="referenceSpan" value="1200" />
    </label>

    <label>
      Span tolerance (in)
      <input type="number" step="0.1" min="0" id="spanTol" value="0.25" />
    </label>

    <label>
      Side elevation from Baseline tolerance (in)
      <input type="number" step="0.1" min="0" id="baselineTol" value="0.125" />
    </label>

    <label>
      Rail to Rail tolerance (in)
      <input type="number" step="0.1" min="0" id="crossLevelTol" value="0.375" />
    </label>
  `;
  layoutContainer.appendChild(tolerances);

  bindLayoutLiveCalculations();
  updateRailToRailReadonlyValues();
  autoPopulateSurveyRunwayLength();

  summary.textContent = "Layout built. Enter values, then run compliance check.";
}

function bindLayoutLiveCalculations() {
  const inputs = layoutContainer.querySelectorAll('input[type="number"]:not(.readonlyCalc)');
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateRailToRailReadonlyValues();
      autoPopulateSurveyRunwayLength();
    });
  });
}

function updateRailToRailReadonlyValues() {
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    if (segmentLen <= 0) continue;

    stationOffsets(segmentLen, measuredStationDistance).forEach((offset) => {
      const outEl = document.getElementById(`rail_to_rail_segment_${segment}_station_${offset}`);
      if (!outEl) return;
      outEl.value = getRailToRailValue(segment, offset).toFixed(3);
    });
  }
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
  const railToRailTol = toNum(document.getElementById("crossLevelTol")?.value, 0.375);
  const referenceSpan = getReferenceSpanValue();
  const spanTol = getSpanToleranceValue();

  const rows = [];

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment);

      stationOffsets(actualDistance, measuredStationDistance).forEach((offset) => {
        const elevationFromBaseline = Math.abs(getSideElevationValue(side.key, segment, offset));

        rows.push({
          check: `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} baseline check at ${offset} ft`,
          measuredText: `${elevationFromBaseline.toFixed(3)} in from baseline`,
          allowedText: `≤ ${baselineTol.toFixed(3)} in`,
          pass: elevationFromBaseline <= baselineTol,
          reference: "TR-13 baseline elevation (TOP OF RAIL)",
        });
      });
    }
  });

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    stationOffsets(segmentLen, measuredStationDistance).forEach((offset) => {
      const railToRailValue = Math.abs(getRailToRailValue(segment, offset));
      rows.push({
        check: `${sides[0].label}${segment} to ${sides[1].label}${segment} rail-to-rail at ${offset} ft`,
        measuredText: `${railToRailValue.toFixed(3)} in rail-to-rail`,
        allowedText: `≤ ${railToRailTol.toFixed(3)} in`,
        pass: railToRailValue <= railToRailTol,
        reference: "TR-13 rail-to-rail check (TOP OF RAIL to TOP OF RAIL)",
      });
    });
  }

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    stationOffsets(segmentLen, measuredStationDistance).forEach((offset) => {
      const measuredSpan = getSpanMeasurementValue(segment, offset);
      const deviation = Math.abs(measuredSpan - referenceSpan);

      rows.push({
        check: `Span measurement for segment ${segment} at ${offset} ft`,
        measuredText: `${measuredSpan.toFixed(3)} in measured (${deviation.toFixed(3)} in deviation from reference)`,
        allowedText: `${referenceSpan.toFixed(3)} in ± ${spanTol.toFixed(3)} in`,
        pass: deviation <= spanTol,
        reference: "TR-13 span verification against single reference span",
      });
    });
  }

  return rows;
}

/* ---------------- Suggestions ---------------- */

function suggestionForRow(row) {
  const check = row.check.toLowerCase();

  if (check.includes("baseline check")) {
    return "Adjust rail seat elevation with shims/grout and re-shoot elevations at affected stations.";
  }
  if (check.includes("rail-to-rail")) {
    return "Correct rail-to-rail difference by raising the low rail or lowering the high rail, then recheck from the same TOP OF RAIL datum.";
  }
  if (check.includes("span measurement")) {
    return "Verify rail gauge against the single reference span, check clip position and rail alignment, then remeasure at the affected station.";
  }
  if (check.includes("straightness")) {
    return "Check alignment/stringline and adjust connection points, then remeasure.";
  }

  return "Review with engineering, correct the source of deviation, and remeasure before acceptance.";
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

/* ---------------- Diagram ---------------- */

function collectRailToRailSeries() {
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);

  const pts = [];
  let cumulativeFt = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLenFt = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    const offsets = stationOffsets(segmentLenFt, measuredStationDistance);
    offsets.forEach((offsetFt) => {
      pts.push({
        stationFt: cumulativeFt + offsetFt,
        valueIn: getRailToRailValue(segment, offsetFt),
      });
    });

    cumulativeFt += segmentLenFt;
  }

  return pts;
}

function buildCrossLevelDiagramSvgString() {
  const sides = sideConfig();
  const tol = toNum(document.getElementById("crossLevelTol")?.value, 0.375);

  const pts = collectRailToRailSeries();
  if (!pts.length) return emptySvg("No rail-to-rail data available.");

  const W = 1100;
  const H = 420;
  const marginL = 110;
  const marginR = 50;
  const railTopY = 90;
  const railBotY = 300;
  const stationBubbleY = railTopY - 20;

  const minFt = Math.min(...pts.map((p) => p.stationFt));
  const maxFt = Math.max(...pts.map((p) => p.stationFt));
  const spanFt = Math.max(1, maxFt - minFt);
  const plotW = W - marginL - marginR;

  const xForFt = (ft) => marginL + ((ft - minFt) / spanFt) * plotW;
  const fails = pts.map((p) => Math.abs(p.valueIn) > tol);

  let svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <marker id="arr" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" />
      </marker>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>

    <g>
      <circle cx="55" cy="${railTopY + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railTopY + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[0].label[0] || "A")}</text>

      <circle cx="55" cy="${railBotY + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="55" y="${railBotY + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[1].label[0] || "B")}</text>
    </g>

    <rect x="${marginL}" y="${railTopY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    <rect x="${marginL}" y="${railBotY}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>

    <text x="${marginL}" y="32" font-family="Arial" font-size="18" font-weight="800">RAIL TO RAIL MARKUP</text>
    <text x="${marginL}" y="54" font-family="Arial" font-size="12">Tolerance: ≤ ${tol.toFixed(3)} in (TR-13)</text>
  `;

  pts.forEach((p, i) => {
    const x = xForFt(p.stationFt);
    const y1 = railTopY + 14;
    const y2 = railBotY;
    const isFail = fails[i];
    const label = nearestFractionStringInches(Math.abs(p.valueIn));

    svg += `
      <g>
        <circle cx="${x}" cy="${stationBubbleY}" r="12" fill="white" stroke="black" stroke-width="2"/>
        <text x="${x}" y="${stationBubbleY + 4}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700">${Math.round(p.stationFt)}'</text>

        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="black" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/>

        <rect x="${x - 30}" y="${(y1 + y2) / 2 - 12}" width="60" height="24"
              fill="white" stroke="${isFail ? "red" : "black"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <text x="${x}" y="${(y1 + y2) / 2 + 6}" text-anchor="middle"
              font-family="Arial" font-size="12" font-weight="800" fill="${isFail ? "red" : "black"}">${escHtml(label)}</text>
      </g>
    `;
  });

  svg += `</svg>`;
  return svg;
}

/* ---------------- Survey table ---------------- */

function buildSurveyStations() {
  if (!surveyTbody) return;

  const startFt = toNum(surveyStartFtEl?.value, 0);
  const lenFt = toNum(surveyRunwayLengthFtEl?.value, 0);
  const stepFt = toNum(surveyStationSpacingFtEl?.value, 10);
  const useBeam = surveyUseBeamEl?.value === "yes";

  if (lenFt <= 0 || stepFt <= 0) {
    if (surveyStatusEl) surveyStatusEl.textContent = "Enter a valid runway length and station spacing.";
    return;
  }

  const card = surveyTable.closest(".card");
  if (card) card.classList.toggle("beamHidden", !useBeam);

  surveyTbody.innerHTML = "";

  const stations = [];
  for (let ft = startFt; ft <= startFt + lenFt + 1e-9; ft += stepFt) {
    stations.push(Number(ft.toFixed(3)));
  }

  for (const ft of stations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ft}</td>
      <td><input data-k="railN" data-ft="${ft}" type="number" step="0.1" value="0"></td>
      <td><input data-k="railS" data-ft="${ft}" type="number" step="0.1" value="0"></td>
      <td class="beamCell"><input data-k="beamN" data-ft="${ft}" type="number" step="0.1" value="0"></td>
      <td class="beamCell"><input data-k="beamS" data-ft="${ft}" type="number" step="0.1" value="0"></td>
      <td class="pfN">—</td>
      <td class="pfS">—</td>
      <td class="rateN">—</td>
      <td class="rateS">—</td>
    `;
    surveyTbody.appendChild(tr);
  }

  if (surveyStatusEl) {
    surveyStatusEl.textContent = `Stations built: ${stations.length} rows (${startFt} to ${(startFt + lenFt).toFixed(0)} ft @ ${stepFt} ft).`;
  }

  setSvgInner(straightnessSvgEl, emptySvg("Enter station offsets and click Evaluate & Render."));
  setSvgInner(eccentricitySvgEl, emptySvg("Eccentricity disabled unless Beam inputs enabled."));
}

/* ---------------- Survey data ---------------- */

function collectSurveyTable() {
  if (!surveyTbody) return null;

  const rows = Array.from(surveyTbody.querySelectorAll("tr"));
  const stationFt = [];
  const railN = [];
  const railS = [];
  const beamN = [];
  const beamS = [];

  for (const tr of rows) {
    const ft = toNum(tr.children[0].textContent, NaN);
    if (!Number.isFinite(ft)) continue;

    const get = (k) => toNum(tr.querySelector(`input[data-k="${k}"]`)?.value, 0);

    stationFt.push(ft);
    railN.push(get("railN"));
    railS.push(get("railS"));
    beamN.push(get("beamN"));
    beamS.push(get("beamS"));
  }

  return { stationFt, railN, railS, beamN, beamS };
}

/* ---------------- Chart rendering ---------------- */

function buildChartSvg({ title, subtitleLeft, subtitleRight, stationFt, series, yMin, yMax, tolWindow }) {
  const W = 1100;
  const H = 360;
  const margin = { l: 70, r: 40, t: 60, b: 50 };
  const plotW = W - margin.l - margin.r;
  const plotH = H - margin.t - margin.b;

  const xMin = Math.min(...stationFt);
  const xMax = Math.max(...stationFt);
  const xSpan = Math.max(1e-6, xMax - xMin);

  const xToPx = (x) => margin.l + ((x - xMin) / xSpan) * plotW;
  const yToPx = (y) => margin.t + (1 - ((y - yMin) / (yMax - yMin))) * plotH;

  function tolAtStation(ft) {
    if (!tolWindow) return 0;
    if (tolWindow.type === "constant") return tolWindow.tolIn;
    if (tolWindow.type === "zones") {
      const z = tolWindow.zones.find((zone) => ft >= zone.startFt && ft <= zone.endFt);
      return z ? z.tolIn : (tolWindow.zones[tolWindow.zones.length - 1]?.tolIn ?? 0);
    }
    return 0;
  }

  const upper = stationFt.map((ft) => tolAtStation(ft));
  const lower = upper.map((v) => -v);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
    <text x="${margin.l}" y="26" font-family="Arial" font-size="18" font-weight="800">${escHtml(title)}</text>
    <text x="${margin.l}" y="46" font-family="Arial" font-size="12">${escHtml(subtitleLeft || "")}</text>
    <text x="${W - margin.r}" y="46" font-family="Arial" font-size="12" text-anchor="end">${escHtml(subtitleRight || "")}</text>
    <rect x="${margin.l}" y="${margin.t}" width="${plotW}" height="${plotH}" fill="white" stroke="black" stroke-width="1"/>
  `);

  const polyPath = (arr) =>
    arr.map((yy, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(yy)}`).join(" ");

  if (tolWindow) {
    parts.push(`<path d="${polyPath(upper)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    parts.push(`<path d="${polyPath(lower)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
  }

  series.forEach((s) => {
    const stroke = s.style?.stroke || "black";
    const width = s.style?.width || 2.5;
    const dash = s.style?.dash || "";
    parts.push(`<path d="${polyPath(s.y)}" fill="none" stroke="${stroke}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`);  
  });

  parts.push(`</svg>`);
  return parts.join("");
}

/* ---------------- Survey evaluation ---------------- */

function evaluateAndRenderSurvey() {
  const data = collectSurveyTable();
  if (!data || data.stationFt.length < 2) {
    if (surveyStatusEl) surveyStatusEl.textContent = "Build stations first, then enter measurements.";
    return;
  }

  const tol = toNum(surveyStraightTolEl?.value, 0.375);
  const rateTol = toNum(surveyRateTolPer20El?.value, 0.25);
  const useBeam = surveyUseBeamEl?.value === "yes";
  const beamWebThickness = toNum(beamWebThicknessEl?.value, 0);
  const zones = parseZones(eccZonesEl?.value);

  const rateN = [];
  const rateS = [];

  for (let i = 0; i < data.stationFt.length; i++) {
    if (i === 0) {
      rateN.push(0);
      rateS.push(0);
      continue;
    }
    const dx = Math.max(1e-6, data.stationFt[i] - data.stationFt[i - 1]);
    rateN.push(Math.abs(data.railN[i] - data.railN[i - 1]) * (20 / dx));
    rateS.push(Math.abs(data.railS[i] - data.railS[i - 1]) * (20 / dx));
  }

  let passNAll = true;
  let passSAll = true;

  const trs = Array.from(surveyTbody.querySelectorAll("tr"));
  trs.forEach((tr, i) => {
    const nOK = Math.abs(data.railN[i]) <= tol && rateN[i] <= rateTol;
    const sOK = Math.abs(data.railS[i]) <= tol && rateS[i] <= rateTol;

    passNAll = passNAll && nOK;
    passSAll = passSAll && sOK;

    const pfN = tr.querySelector(".pfN");
    const pfS = tr.querySelector(".pfS");
    const rNCell = tr.querySelector(".rateN");
    const rSCell = tr.querySelector(".rateS");

    if (pfN) {
      pfN.textContent = nOK ? "PASS" : "FAIL";
      pfN.style.color = nOK ? "#0a7a2f" : "#c1121f";
    }
    if (pfS) {
      pfS.textContent = sOK ? "PASS" : "FAIL";
      pfS.style.color = sOK ? "#0a7a2f" : "#c1121f";
    }
    if (rNCell) {
      rNCell.textContent = rateN[i].toFixed(3);
      rNCell.style.color = rateN[i] <= rateTol ? "#111" : "#c1121f";
    }
    if (rSCell) {
      rSCell.textContent = rateS[i].toFixed(3);
      rSCell.style.color = rateS[i] <= rateTol ? "#111" : "#c1121f";
    }
  });

  const straightMax = Math.max(tol, seriesMaxAbs(data.railN), seriesMaxAbs(data.railS));
  const straightPad = Math.max(0.25, Math.ceil(straightMax * 2) / 2);

  latestStraightnessChartSvg = buildChartSvg({
    title: "RUNWAY STRAIGHTNESS SURVEY",
    subtitleLeft: `Tolerance window: ±${tol.toFixed(3)} in`,
    subtitleRight: `Rate-of-change limit: ${rateTol.toFixed(3)} in / 20 ft`,
    stationFt: data.stationFt,
    series: [
      { y: data.railN, style: { stroke: "black", width: 2.5 } },
      { y: data.railS, style: { stroke: "#555", width: 2.5, dash: "8 5" } },
    ],
    yMin: -straightPad,
    yMax: straightPad,
    tolWindow: { type: "constant", tolIn: tol },
  });
  setSvgInner(straightnessSvgEl, latestStraightnessChartSvg);

  if (useBeam) {
    const beamCenterN = data.beamN.map((v) => toNum(v, 0) + beamWebThickness / 2);
    const beamCenterS = data.beamS.map((v) => toNum(v, 0) + beamWebThickness / 2);

    const eccN = data.railN.map((v, i) => v - beamCenterN[i]);
    const eccS = data.railS.map((v, i) => v - beamCenterS[i]);

    const eccTolWindow = zones ? { type: "zones", zones } : { type: "constant", tolIn: 0.5 };
    const zoneTols = zones ? zones.map((z) => z.tolIn) : [0.5];
    const eccMax = Math.max(...zoneTols, seriesMaxAbs(eccN), seriesMaxAbs(eccS));
    const eccPad = Math.max(0.25, Math.ceil(eccMax * 2) / 2);

    latestEccentricityChartSvg = buildChartSvg({
      title: "ECCENTRICITY SURVEY",
      subtitleLeft: `Beam web thickness applied: ${beamWebThickness.toFixed(3)} in`,
      subtitleRight: zones ? "Zone tolerances active" : "Default tolerance window shown",
      stationFt: data.stationFt,
      series: [
        { y: eccN, style: { stroke: "black", width: 2.5 } },
        { y: eccS, style: { stroke: "#555", width: 2.5, dash: "8 5" } },
      ],
      yMin: -eccPad,
      yMax: eccPad,
      tolWindow: eccTolWindow,
    });
    setSvgInner(eccentricitySvgEl, latestEccentricityChartSvg);
  } else {
    latestEccentricityChartSvg = emptySvg("Eccentricity disabled unless Beam inputs enabled.");
    setSvgInner(eccentricitySvgEl, latestEccentricityChartSvg);
  }

  if (surveyStatusEl) {
    surveyStatusEl.textContent = `Survey evaluated. Straightness: N ${passNAll ? "PASS" : "FAIL"}, S ${passSAll ? "PASS" : "FAIL"}.`;
  }
}

/* ---------------- PDF export ---------------- */

function exportPdfReport() {
  if (!latestRows.length) {
    summary.textContent = "Run a compliance check first, then export to PDF.";
    return;
  }

  latestCrossLevelDiagramSvg = buildCrossLevelDiagramSvgString();

  const projectName = document.getElementById("projectName")?.value || "Unnamed Project";
  const generatedAt = new Date().toLocaleString();

  const rowsHtml = latestRows.map((row) => `
    <tr>
      <td>${escHtml(row.check)}</td>
      <td>${escHtml(row.measuredText)}</td>
      <td>${escHtml(row.allowedText)}</td>
      <td>${row.pass ? "PASS" : "FAIL"}</td>
      <td>${escHtml(row.reference)}</td>
    </tr>
  `).join("");

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
        </style>
      </head>
      <body>
        <h1>Big G Steel - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${escHtml(projectName)}<br><strong>Generated:</strong> ${escHtml(generatedAt)}</div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Rail to Rail Markup Diagram</h2>
          ${latestCrossLevelDiagramSvg}
        </div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Straightness Chart</h2>
          ${latestStraightnessChartSvg || emptySvg("No straightness chart rendered yet.")}
        </div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Eccentricity Chart</h2>
          ${latestEccentricityChartSvg || emptySvg("No eccentricity chart rendered yet.")}
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

  if (profile) {
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
  }

  rows.push(...evaluateElevationRows());
  latestRows = rows;

  renderSuggestions(rows);

  const passed = rows.filter((row) => row.pass).length;

  resultBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escHtml(row.check)}</td>
      <td>${escHtml(row.measuredText)}</td>
      <td>${escHtml(row.allowedText)}</td>
      <td class="status ${row.pass ? "pass" : "fail"}">${row.pass ? "PASS" : "FAIL"}</td>
      <td>${escHtml(row.reference)}</td>
    </tr>
  `).join("");

  summary.textContent = `${passed} of ${rows.length} checks passed for profile: ${profileSelect.value || "Default"}.`;
  latestCrossLevelDiagramSvg = buildCrossLevelDiagramSvgString();
}

/* ---------------- Fractions Toggle ---------------- */

function initFractionsToggle() {
  const btn = document.getElementById("fracToggle");
  const body = document.getElementById("fracBody");
  if (!btn || !body) return;

  const mq = window.matchMedia("(min-width: 900px)");

  const setState = (open) => {
    body.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Hide" : "Show";
  };

  setState(mq.matches);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    setState(body.hidden);
  });

  window.addEventListener("resize", () => {
    if (mq.matches) setState(true);
  });
}

/* ---------------- Init ---------------- */

function init() {
  if (!assertRequiredDom()) return;

  initFractionsToggle();

  buildProfileOptions();
  const names = Object.keys(profiles);
  if (names.length) {
    profileSelect.value = names[0];
  }

  renderForm();
  buildLayout();
  autoPopulateSurveyRunwayLength();
  buildSurveyStations();

  profileSelect.addEventListener("change", () => {
    renderForm();
    resultBody.innerHTML = "";
    summary.textContent = "Inputs updated. Run the compliance check.";
  });

  buildLayoutBtn.addEventListener("click", () => {
    buildLayout();
  });

  runBtn.addEventListener("click", runCompliance);
  exportPdfBtn.addEventListener("click", exportPdfReport);

  if (buildSurveyStationsBtn) {
    buildSurveyStationsBtn.addEventListener("click", buildSurveyStations);
  }

  if (evaluateSurveyBtn) {
    evaluateSurveyBtn.addEventListener("click", evaluateAndRenderSurvey);
  }

  if (surveyUseBeamEl) {
    surveyUseBeamEl.addEventListener("change", () => {
      buildSurveyStations();
    });
  }
}

window.addEventListener("load", init);
