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
let latestMarkupDiagramSvg = "";
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="380" viewBox="0 0 1200 380">
    <rect x="0" y="0" width="1200" height="380" fill="white"/>
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

function getBaselineToleranceValue() {
  return toNum(document.getElementById("baselineTol")?.value, 0.125);
}

function getCrossLevelToleranceValue() {
  return toNum(document.getElementById("crossLevelTol")?.value, 0.375);
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

function stationLabel(segment, offsetFt) {
  return `Seg ${segment} @ ${offsetFt} ft`;
}

function correctionArrowTextBaseline(valueIn, tolIn) {
  const absVal = Math.abs(valueIn);
  const excess = Math.max(0, absVal - tolIn);
  if (excess <= 0) return "WITHIN TOL";
  if (valueIn > 0) return `LOWER RAIL ${nearestFractionStringInches(excess)} (${excess.toFixed(3)} in)`;
  if (valueIn < 0) return `RAISE RAIL ${nearestFractionStringInches(excess)} (${excess.toFixed(3)} in)`;
  return "CHECK MEASUREMENT";
}

function correctionArrowTextCrossLevel(valueIn, tolIn, sideAName, sideBName) {
  const absVal = Math.abs(valueIn);
  const excess = Math.max(0, absVal - tolIn);
  if (excess <= 0) return "WITHIN TOL";

  if (valueIn > 0) {
    return `LOWER ${sideAName} or RAISE ${sideBName} by ${nearestFractionStringInches(excess)} (${excess.toFixed(3)} in)`;
  }
  return `LOWER ${sideBName} or RAISE ${sideAName} by ${nearestFractionStringInches(excess)} (${excess.toFixed(3)} in)`;
}

function correctionArrowTextSpan(measuredSpan, referenceSpan, spanTol) {
  const delta = measuredSpan - referenceSpan;
  const absDelta = Math.abs(delta);
  if (absDelta <= spanTol) return "WITHIN TOL";

  if (delta > 0) {
    return `SPAN TOO WIDE — MOVE RAILS IN ${nearestFractionStringInches(absDelta)} (${absDelta.toFixed(3)} in total)`;
  }
  return `SPAN TOO NARROW — MOVE RAILS OUT ${nearestFractionStringInches(absDelta)} (${absDelta.toFixed(3)} in total)`;
}

function buildNiceCenteredYAxis(maxAbsValue, step = 0.1, minHalfRange = 0.4) {
  const safeStep = Math.max(0.01, step);
  const padded = Math.max(minHalfRange, maxAbsValue);
  const halfRange = Math.ceil(padded / safeStep) * safeStep;

  const yMin = -halfRange;
  const yMax = halfRange;

  const ticks = [];
  for (let y = yMin; y <= yMax + 1e-9; y += safeStep) {
    ticks.push(Number(y.toFixed(3)));
  }

  return { yMin, yMax, ticks };
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
          <input type="number" step="0.001" id="${side.key}_segment_${segment}_station_${offset}" value="0" />`;
        sideMeasurements.appendChild(label);
      });
    }
  });
  layoutContainer.appendChild(sideMeasurements);

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
        <input type="number" step="0.001" id="span_segment_${segment}_station_${offset}" value="0" />`;
      spanMeasurements.appendChild(label);
    });
  }
  layoutContainer.appendChild(spanMeasurements);

  const tolerances = document.createElement("fieldset");
  tolerances.className = "grid two-col";
  tolerances.innerHTML = `
    <legend>TR-13 checks and tolerances</legend>

    <label>
      Reference span (in)
      <input type="number" step="0.001" min="0" id="referenceSpan" value="1200" />
    </label>

    <label>
      Span tolerance (in)
      <input type="number" step="0.001" min="0" id="spanTol" value="0.25" />
    </label>

    <label>
      Side elevation from Baseline tolerance (in)
      <input type="number" step="0.001" min="0" id="baselineTol" value="0.125" />
    </label>

    <label>
      Rail to Rail tolerance (in)
      <input type="number" step="0.001" min="0" id="crossLevelTol" value="0.375" />
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

  const baselineTol = getBaselineToleranceValue();
  const railToRailTol = getCrossLevelToleranceValue();
  const referenceSpan = getReferenceSpanValue();
  const spanTol = getSpanToleranceValue();

  const rows = [];

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment);

      stationOffsets(actualDistance, measuredStationDistance).forEach((offset) => {
        const rawValue = getSideElevationValue(side.key, segment, offset);
        const elevationFromBaseline = Math.abs(rawValue);

        rows.push({
          check: `${side.label} Column ${segment} to ${side.label} Column ${segment + 1} baseline check at ${offset} ft`,
          measuredText: `${rawValue.toFixed(3)} in from baseline (${elevationFromBaseline.toFixed(3)} in abs)`,
          allowedText: `±${baselineTol.toFixed(3)} in`,
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
      const rawRailToRail = getRailToRailValue(segment, offset);
      const railToRailValue = Math.abs(rawRailToRail);

      rows.push({
        check: `${sides[0].label}${segment} to ${sides[1].label}${segment} rail-to-rail at ${offset} ft`,
        measuredText: `${rawRailToRail.toFixed(3)} in rail-to-rail (${railToRailValue.toFixed(3)} in abs)`,
        allowedText: `±${railToRailTol.toFixed(3)} in`,
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
      const deviation = measuredSpan - referenceSpan;

      rows.push({
        check: `Span measurement for segment ${segment} at ${offset} ft`,
        measuredText: `${measuredSpan.toFixed(3)} in measured (${deviation.toFixed(3)} in vs reference)`,
        allowedText: `${referenceSpan.toFixed(3)} in ± ${spanTol.toFixed(3)} in`,
        pass: Math.abs(deviation) <= spanTol,
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
    return "Adjust rail seat elevation with shims or grout. Lower positive high spots and raise negative low spots, then re-shoot elevations.";
  }
  if (check.includes("rail-to-rail")) {
    return "Correct cross-level by lowering the high rail or raising the low rail by the out-of-tolerance amount, then recheck from TOP OF RAIL.";
  }
  if (check.includes("span measurement")) {
    return "Correct gauge at the failed station. If span is too wide move rails in; if too narrow move rails out. Verify clips, alignment, and remeasure.";
  }
  if (check.includes("straightness")) {
    return "Check alignment or stringline and adjust connection points, then remeasure.";
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

/* ---------------- 3-layer markup data ---------------- */

function collectBaselineLayerData() {
  const sides = sideConfig();
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);
  const tol = getBaselineToleranceValue();

  const pts = [];

  sides.forEach((side) => {
    let cumulativeFt = 0;

    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment);
      const offsets = stationOffsets(actualDistance, measuredStationDistance);

      offsets.forEach((offsetFt) => {
        const raw = getSideElevationValue(side.key, segment, offsetFt);
        const absVal = Math.abs(raw);

        pts.push({
          family: "baseline",
          sideKey: side.key,
          sideLabel: side.label,
          segment,
          offsetFt,
          stationFt: cumulativeFt + offsetFt,
          valueIn: raw,
          absValueIn: absVal,
          tolIn: tol,
          pass: absVal <= tol,
          checkLabel: `${side.label} ${stationLabel(segment, offsetFt)}`,
          correctionText: correctionArrowTextBaseline(raw, tol),
        });
      });

      cumulativeFt += actualDistance;
    }
  });

  return pts;
}

function collectCrossLevelLayerData() {
  const sides = sideConfig();
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);
  const tol = getCrossLevelToleranceValue();

  const pts = [];
  let cumulativeFt = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLenFt = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    const offsets = stationOffsets(segmentLenFt, measuredStationDistance);

    offsets.forEach((offsetFt) => {
      const raw = getRailToRailValue(segment, offsetFt);
      const absVal = Math.abs(raw);

      pts.push({
        family: "crossLevel",
        segment,
        offsetFt,
        stationFt: cumulativeFt + offsetFt,
        valueIn: raw,
        absValueIn: absVal,
        tolIn: tol,
        pass: absVal <= tol,
        checkLabel: `${sides[0].label}${segment} to ${sides[1].label}${segment} @ ${offsetFt} ft`,
        correctionText: correctionArrowTextCrossLevel(raw, tol, sides[0].label, sides[1].label),
      });
    });

    cumulativeFt += segmentLenFt;
  }

  return pts;
}

function collectSpanLayerData() {
  const columns = toNum(columnsPerSideInput.value, 0);
  const measuredStationDistance = toNum(measuredStationDistanceInput.value, 10);
  const referenceSpan = getReferenceSpanValue();
  const spanTol = getSpanToleranceValue();

  const pts = [];
  let cumulativeFt = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLenFt = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment)
    );

    const offsets = stationOffsets(segmentLenFt, measuredStationDistance);

    offsets.forEach((offsetFt) => {
      const measuredSpan = getSpanMeasurementValue(segment, offsetFt);
      const delta = measuredSpan - referenceSpan;

      pts.push({
        family: "span",
        segment,
        offsetFt,
        stationFt: cumulativeFt + offsetFt,
        valueIn: measuredSpan,
        deltaIn: delta,
        tolIn: spanTol,
        referenceSpanIn: referenceSpan,
        pass: Math.abs(delta) <= spanTol,
        checkLabel: `Span Seg ${segment} @ ${offsetFt} ft`,
        correctionText: correctionArrowTextSpan(measuredSpan, referenceSpan, spanTol),
      });
    });

    cumulativeFt += segmentLenFt;
  }

  return pts;
}

/* ---------------- 3-layer markup SVG ---------------- */

function buildThreeLayerMarkupSvgString() {
  const sides = sideConfig();
  const baselinePts = collectBaselineLayerData();
  const crossPts = collectCrossLevelLayerData();
  const spanPts = collectSpanLayerData();

  const allPts = [...baselinePts, ...crossPts, ...spanPts];
  if (!allPts.length) return emptySvg("No markup data available.");

  const W = 1450;
  const H = 1180;
  const marginL = 120;
  const marginR = 40;
  const plotW = W - marginL - marginR;

  const allStations = allPts.map((p) => p.stationFt);
  const minFt = Math.min(...allStations);
  const maxFt = Math.max(...allStations);
  const spanFt = Math.max(1, maxFt - minFt);

  const xForFt = (ft) => marginL + ((ft - minFt) / spanFt) * plotW;

  const layer1Top = 100;
  const layer1MidA = 155;
  const layer1MidB = 230;
  const layer1Bot = 305;

  const layer2Top = 380;
  const layer2North = 445;
  const layer2South = 560;
  const layer2Bot = 635;

  const layer3Top = 715;
  const layer3North = 785;
  const layer3South = 930;
  const layer3Bot = 1095;

  const baselineTol = getBaselineToleranceValue();
  const crossTol = getCrossLevelToleranceValue();
  const referenceSpan = getReferenceSpanValue();
  const spanTol = getSpanToleranceValue();

  let svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <marker id="arrowBlack" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="black"/>
      </marker>
      <marker id="arrowRed" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto-start-reverse">
        <path d="M0,0 L12,6 L0,12 z" fill="#c1121f"/>
      </marker>
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>

    <text x="${marginL}" y="34" font-family="Arial" font-size="24" font-weight="800">TR-13 THREE-LAYER MARKUP DIAGRAM</text>
    <text x="${marginL}" y="58" font-family="Arial" font-size="13">Red callouts mark out-of-tolerance stations and show correction direction.</text>

    <g>
      <rect x="${marginL}" y="68" width="18" height="12" fill="#c1121f"/>
      <text x="${marginL + 24}" y="79" font-family="Arial" font-size="12">FAIL / out of tolerance</text>
      <rect x="${marginL + 210}" y="68" width="18" height="12" fill="white" stroke="black" stroke-width="1.5"/>
      <text x="${marginL + 236}" y="79" font-family="Arial" font-size="12">PASS / within tolerance</text>
    </g>

    <g>
      <rect x="25" y="${layer1Top}" width="${W - 50}" height="${layer1Bot - layer1Top}" fill="#fafafa" stroke="#cfcfcf"/>
      <text x="40" y="${layer1Top + 24}" font-family="Arial" font-size="20" font-weight="800">LAYER 1 — BASELINE ELEVATION</text>
      <text x="40" y="${layer1Top + 46}" font-family="Arial" font-size="12">Tolerance: ±${baselineTol.toFixed(3)} in from baseline</text>

      <circle cx="70" cy="${layer1MidA + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer1MidA + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[0].label[0] || "A")}</text>

      <circle cx="70" cy="${layer1MidB + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer1MidB + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[1].label[0] || "B")}</text>

      <rect x="${marginL}" y="${layer1MidA}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
      <rect x="${marginL}" y="${layer1MidB}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    </g>

    <g>
      <rect x="25" y="${layer2Top}" width="${W - 50}" height="${layer2Bot - layer2Top}" fill="#fafafa" stroke="#cfcfcf"/>
      <text x="40" y="${layer2Top + 24}" font-family="Arial" font-size="20" font-weight="800">LAYER 2 — RAIL TO RAIL</text>
      <text x="40" y="${layer2Top + 46}" font-family="Arial" font-size="12">Tolerance: ±${crossTol.toFixed(3)} in rail-to-rail</text>

      <circle cx="70" cy="${layer2North + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer2North + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[0].label[0] || "A")}</text>

      <circle cx="70" cy="${layer2South + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer2South + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[1].label[0] || "B")}</text>

      <rect x="${marginL}" y="${layer2North}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
      <rect x="${marginL}" y="${layer2South}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    </g>

    <g>
      <rect x="25" y="${layer3Top}" width="${W - 50}" height="${layer3Bot - layer3Top}" fill="#fafafa" stroke="#cfcfcf"/>
      <text x="40" y="${layer3Top + 24}" font-family="Arial" font-size="20" font-weight="800">LAYER 3 — SPAN</text>
      <text x="40" y="${layer3Top + 46}" font-family="Arial" font-size="12">Reference span: ${referenceSpan.toFixed(3)} in ± ${spanTol.toFixed(3)} in</text>

      <circle cx="70" cy="${layer3North + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer3North + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[0].label[0] || "A")}</text>

      <circle cx="70" cy="${layer3South + 7}" r="18" fill="white" stroke="black" stroke-width="2"/>
      <text x="70" y="${layer3South + 12}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${escHtml(sides[1].label[0] || "B")}</text>

      <rect x="${marginL}" y="${layer3North}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
      <rect x="${marginL}" y="${layer3South}" width="${plotW}" height="14" fill="white" stroke="black" stroke-width="2"/>
    </g>
  `;

  const allUniqueStations = [...new Set(allPts.map((p) => p.stationFt.toFixed(3)))].map(Number).sort((a, b) => a - b);

  allUniqueStations.forEach((ft) => {
    const x = xForFt(ft);
    const txt = `${Math.round(ft)}'`;

    svg += `
      <g>
        <circle cx="${x}" cy="${layer1Top + 70}" r="11" fill="white" stroke="black" stroke-width="1.5"/>
        <text x="${x}" y="${layer1Top + 74}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700">${txt}</text>

        <circle cx="${x}" cy="${layer2Top + 70}" r="11" fill="white" stroke="black" stroke-width="1.5"/>
        <text x="${x}" y="${layer2Top + 74}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700">${txt}</text>

        <circle cx="${x}" cy="${layer3Top + 70}" r="11" fill="white" stroke="black" stroke-width="1.5"/>
        <text x="${x}" y="${layer3Top + 74}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700">${txt}</text>
      </g>
    `;
  });

  baselinePts.forEach((p) => {
    const x = xForFt(p.stationFt);
    const yRail = p.sideKey === "sideA" ? layer1MidA + 7 : layer1MidB + 7;
    const isFail = !p.pass;
    const boxY = p.sideKey === "sideA" ? layer1Top + 82 : layer1Top + 155;
    const valueText = `${p.valueIn.toFixed(3)} in`;
    const tolText = `Tol ±${p.tolIn.toFixed(3)}`;

    svg += `
      <g>
        <line x1="${x}" y1="${yRail - 18}" x2="${x}" y2="${yRail + 18}" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <circle cx="${x}" cy="${yRail}" r="${isFail ? 7 : 5}" fill="${isFail ? "#c1121f" : "white"}" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="2"/>
        <rect x="${x - 48}" y="${boxY}" width="96" height="34" fill="white" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 1.25}"/>
        <text x="${x}" y="${boxY + 13}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="${isFail ? "#c1121f" : "#111"}">${escHtml(valueText)}</text>
        <text x="${x}" y="${boxY + 27}" text-anchor="middle" font-family="Arial" font-size="9" fill="${isFail ? "#c1121f" : "#111"}">${escHtml(tolText)}</text>
      </g>
    `;

    if (isFail) {
      const calloutX = Math.min(W - 260, Math.max(180, x + 18));
      const calloutY = p.sideKey === "sideA" ? layer1Top + 78 : layer1Top + 150;

      svg += `
        <g>
          <line x1="${x + 8}" y1="${yRail}" x2="${calloutX}" y2="${calloutY + 10}" stroke="#c1121f" stroke-width="2" marker-end="url(#arrowRed)"/>
          <rect x="${calloutX}" y="${calloutY}" width="230" height="46" fill="#fff5f5" stroke="#c1121f" stroke-width="2"/>
          <text x="${calloutX + 8}" y="${calloutY + 16}" font-family="Arial" font-size="11" font-weight="800" fill="#c1121f">FAIL — ${escHtml(p.checkLabel)}</text>
          <text x="${calloutX + 8}" y="${calloutY + 32}" font-family="Arial" font-size="10" fill="#c1121f">${escHtml(p.correctionText)}</text>
        </g>
      `;
    }
  });

  crossPts.forEach((p) => {
    const x = xForFt(p.stationFt);
    const isFail = !p.pass;
    const y1 = layer2North + 14;
    const y2 = layer2South;
    const label = `${nearestFractionStringInches(p.absValueIn)} (${p.valueIn.toFixed(3)})`;

    svg += `
      <g>
        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 2}" marker-start="url(#arrowBlack)" marker-end="url(#arrowBlack)"/>
        <rect x="${x - 40}" y="${(y1 + y2) / 2 - 14}" width="80" height="28" fill="white" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <text x="${x}" y="${(y1 + y2) / 2 + 5}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="800" fill="${isFail ? "#c1121f" : "#111"}">${escHtml(label)}</text>
      </g>
    `;

    if (isFail) {
      const calloutX = Math.min(W - 330, Math.max(180, x + 18));
      const calloutY = layer2Top + 120;

      svg += `
        <g>
          <line x1="${x + 6}" y1="${(y1 + y2) / 2}" x2="${calloutX}" y2="${calloutY + 12}" stroke="#c1121f" stroke-width="2" marker-end="url(#arrowRed)"/>
          <rect x="${calloutX}" y="${calloutY}" width="300" height="50" fill="#fff5f5" stroke="#c1121f" stroke-width="2"/>
          <text x="${calloutX + 8}" y="${calloutY + 17}" font-family="Arial" font-size="11" font-weight="800" fill="#c1121f">FAIL — ${escHtml(p.checkLabel)}</text>
          <text x="${calloutX + 8}" y="${calloutY + 34}" font-family="Arial" font-size="10" fill="#c1121f">${escHtml(p.correctionText)}</text>
        </g>
      `;
    }
  });

  let spanFailIndex = 0;

  spanPts.forEach((p) => {
    const x = xForFt(p.stationFt);
    const isFail = !p.pass;
    const y1 = layer3North + 14;
    const y2 = layer3South;
    const midY = (y1 + y2) / 2;
    const spanLabel = `${p.valueIn.toFixed(3)} in`;

    svg += `
      <g>
        <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 2}" marker-start="url(#arrowBlack)" marker-end="url(#arrowBlack)"/>
        <rect x="${x - 44}" y="${midY - 16}" width="88" height="32" fill="white" stroke="${isFail ? "#c1121f" : "#111"}" stroke-width="${isFail ? 2.5 : 1.5}"/>
        <text x="${x}" y="${midY - 1}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="800" fill="${isFail ? "#c1121f" : "#111"}">${escHtml(spanLabel)}</text>
        <text x="${x}" y="${midY + 12}" text-anchor="middle" font-family="Arial" font-size="9" fill="${isFail ? "#c1121f" : "#111"}">Δ ${escHtml(p.deltaIn.toFixed(3))}</text>
      </g>
    `;

    if (isFail) {
      const lane = spanFailIndex % 4;
      const side = spanFailIndex % 2 === 0 ? "right" : "left";
      spanFailIndex += 1;

      const calloutW = 250;
      const calloutH = 58;
      const laneYs = [
        layer3Top + 92,
        layer3Top + 150,
        layer3Top + 208,
        layer3Top + 266,
      ];
      const calloutY = laneYs[lane];

      let calloutX;
      if (side === "right") {
        calloutX = x + 24;
        if (calloutX + calloutW > W - 24) calloutX = x - calloutW - 24;
      } else {
        calloutX = x - calloutW - 24;
        if (calloutX < 24) calloutX = x + 24;
      }

      const lineEndX = side === "right" ? calloutX : calloutX + calloutW;
      const lineEndY = calloutY + 16;

      const failTitle = `FAIL — ${p.checkLabel}`;
      const failAction = p.correctionText;
      const failDetail = `Ref ${p.referenceSpanIn.toFixed(3)} in | Tol ±${p.tolIn.toFixed(3)} in`;

      svg += `
        <g>
          <line x1="${x + (side === "right" ? 6 : -6)}" y1="${midY}" x2="${lineEndX}" y2="${lineEndY}" stroke="#c1121f" stroke-width="2" marker-end="url(#arrowRed)"/>
          <rect x="${calloutX}" y="${calloutY}" width="${calloutW}" height="${calloutH}" fill="#fff5f5" stroke="#c1121f" stroke-width="2"/>
          <text x="${calloutX + 8}" y="${calloutY + 16}" font-family="Arial" font-size="10.5" font-weight="800" fill="#c1121f">${escHtml(failTitle)}</text>
          <text x="${calloutX + 8}" y="${calloutY + 33}" font-family="Arial" font-size="9.5" fill="#c1121f">${escHtml(failAction)}</text>
          <text x="${calloutX + 8}" y="${calloutY + 48}" font-family="Arial" font-size="9" fill="#c1121f">${escHtml(failDetail)}</text>
        </g>
      `;
    }
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
  const H = 420;
  const margin = { l: 88, r: 40, t: 64, b: 62 };
  const plotW = W - margin.l - margin.r;
  const plotH = H - margin.t - margin.b;

  if (!stationFt || stationFt.length < 2) {
    return emptySvg("Not enough chart data.");
  }

  const xMin = Math.min(...stationFt);
  const xMax = Math.max(...stationFt);
  const xSpan = Math.max(1e-6, xMax - xMin);

  const maxSeriesAbs = Math.max(
    Math.abs(yMin || 0),
    Math.abs(yMax || 0),
    ...series.flatMap((s) => s.y.map((v) => Math.abs(toNum(v, 0))))
  );

  let tolAbs = 0;
  if (tolWindow) {
    if (tolWindow.type === "constant") {
      tolAbs = Math.abs(toNum(tolWindow.tolIn, 0));
    } else if (tolWindow.type === "zones" && Array.isArray(tolWindow.zones)) {
      tolAbs = Math.max(...tolWindow.zones.map((z) => Math.abs(toNum(z.tolIn, 0))), 0);
    }
  }

  const axis = buildNiceCenteredYAxis(Math.max(maxSeriesAbs, tolAbs), 0.1, 0.4);
  const finalYMin = axis.yMin;
  const finalYMax = axis.yMax;
  const yTicks = axis.ticks;

  const xToPx = (x) => margin.l + ((x - xMin) / xSpan) * plotW;
  const yToPx = (y) => margin.t + (1 - ((y - finalYMin) / (finalYMax - finalYMin))) * plotH;

  function tolAtStation(ft) {
    if (!tolWindow) return 0;

    if (tolWindow.type === "constant") {
      return toNum(tolWindow.tolIn, 0);
    }

    if (tolWindow.type === "zones") {
      const z = tolWindow.zones.find((zone) => ft >= zone.startFt && ft <= zone.endFt);
      return z ? toNum(z.tolIn, 0) : (tolWindow.zones[tolWindow.zones.length - 1]?.tolIn ?? 0);
    }

    return 0;
  }

  const upperTol = stationFt.map((ft) => tolAtStation(ft));
  const lowerTol = upperTol.map((v) => -v);

  const polyPath = (arr) =>
    arr.map((yy, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(yy)}`).join(" ");

  const parts = [];
  parts.push(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
      <text x="${margin.l}" y="28" font-family="Arial" font-size="18" font-weight="800">${escHtml(title)}</text>
      <text x="${margin.l}" y="48" font-family="Arial" font-size="12">${escHtml(subtitleLeft || "")}</text>
      <text x="${W - margin.r}" y="48" font-family="Arial" font-size="12" text-anchor="end">${escHtml(subtitleRight || "")}</text>

      <rect x="${margin.l}" y="${margin.t}" width="${plotW}" height="${plotH}" fill="white" stroke="#666" stroke-width="1.2"/>
  `);

  yTicks.forEach((tick) => {
    const y = yToPx(tick);
    const isZero = Math.abs(tick) < 1e-9;

    parts.push(`
      <line
        x1="${margin.l}"
        y1="${y}"
        x2="${margin.l + plotW}"
        y2="${y}"
        stroke="${isZero ? "#444" : "#d9d9d9"}"
        stroke-width="${isZero ? "1.8" : "1"}"
      />
      <text
        x="${margin.l - 10}"
        y="${y + 4}"
        text-anchor="end"
        font-family="Arial"
        font-size="10"
        fill="#666"
      >${tick.toFixed(1)}</text>
    `);
  });

  stationFt.forEach((ft, i) => {
    const x = xToPx(ft);

    parts.push(`
      <line x1="${x}" y1="${margin.t + plotH}" x2="${x}" y2="${margin.t + plotH + 6}" stroke="#777" stroke-width="1"/>
    `);

    const showLabel =
      stationFt.length <= 14 ||
      i === 0 ||
      i === stationFt.length - 1 ||
      i % 2 === 0;

    if (showLabel) {
      parts.push(`
        <text x="${x}" y="${margin.t + plotH + 20}" text-anchor="middle" font-family="Arial" font-size="10" fill="#555">${ft.toFixed(0)}'</text>
      `);
    }
  });

  if (tolWindow) {
    parts.push(`<path d="${polyPath(upperTol)}" fill="none" stroke="#ff4d4d" stroke-width="1.5" stroke-dasharray="4 4"/>`);
    parts.push(`<path d="${polyPath(lowerTol)}" fill="none" stroke="#ff4d4d" stroke-width="1.5" stroke-dasharray="4 4"/>`);
  }

  series.forEach((s) => {
    const stroke = s.style?.stroke || "black";
    const width = s.style?.width || 2.2;
    const dash = s.style?.dash || "";

    parts.push(`
      <path
        d="${polyPath(s.y)}"
        fill="none"
        stroke="${stroke}"
        stroke-width="${width}"
        ${dash ? `stroke-dasharray="${dash}"` : ""}
      />
    `);

    s.y.forEach((yy, i) => {
      const x = xToPx(stationFt[i]);
      const y = yToPx(yy);
      parts.push(`<circle cx="${x}" cy="${y}" r="2.2" fill="${stroke}" />`);
    });
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
      pfS.style.color = nOK ? "#0a7a2f" : "#c1121f";
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

  latestStraightnessChartSvg = buildChartSvg({
    title: "RUNWAY STRAIGHTNESS SURVEY",
    subtitleLeft: `Tolerance window: ±${tol.toFixed(3)} in`,
    subtitleRight: `Rate-of-change limit: ${rateTol.toFixed(3)} in / 20 ft`,
    stationFt: data.stationFt,
    series: [
      { y: data.railN, style: { stroke: "black", width: 2.4 } },
      { y: data.railS, style: { stroke: "#666", width: 2.2, dash: "7 5" } },
    ],
    yMin: null,
    yMax: null,
    tolWindow: { type: "constant", tolIn: tol },
  });
  setSvgInner(straightnessSvgEl, latestStraightnessChartSvg);

  if (useBeam) {
    const beamCenterN = data.beamN.map((v) => toNum(v, 0) + beamWebThickness / 2);
    const beamCenterS = data.beamS.map((v) => toNum(v, 0) + beamWebThickness / 2);

    const eccN = data.railN.map((v, i) => v - beamCenterN[i]);
    const eccS = data.railS.map((v, i) => v - beamCenterS[i]);

    const eccTolWindow = zones ? { type: "zones", zones } : { type: "constant", tolIn: 0.5 };

    latestEccentricityChartSvg = buildChartSvg({
      title: "ECCENTRICITY SURVEY",
      subtitleLeft: `Beam web thickness applied: ${beamWebThickness.toFixed(3)} in`,
      subtitleRight: zones ? "Zone tolerances active" : "Default tolerance window shown",
      stationFt: data.stationFt,
      series: [
        { y: eccN, style: { stroke: "black", width: 2.4 } },
        { y: eccS, style: { stroke: "#666", width: 2.2, dash: "7 5" } },
      ],
      yMin: null,
      yMax: null,
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

  latestMarkupDiagramSvg = buildThreeLayerMarkupSvgString();

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
          .box { margin: 14px 0 18px; border: 1px solid #ccc; padding: 10px; border-radius: 8px; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>Big G Steel - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${escHtml(projectName)}<br><strong>Generated:</strong> ${escHtml(generatedAt)}</div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Three-Layer Markup Diagram</h2>
          ${latestMarkupDiagramSvg}
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
  latestMarkupDiagramSvg = buildThreeLayerMarkupSvgString();
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
