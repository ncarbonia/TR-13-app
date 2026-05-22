const FRACTION_ROWS = [
  ["1/32", "0.03125"], ["1/16", "0.06250"], ["3/32", "0.09375"], ["1/8", "0.12500"],
  ["5/32", "0.15625"], ["3/16", "0.18750"], ["7/32", "0.21875"], ["1/4", "0.25000"],
  ["9/32", "0.28125"], ["5/16", "0.31250"], ["11/32", "0.34375"], ["3/8", "0.37500"],
  ["13/32", "0.40625"], ["7/16", "0.43750"], ["15/32", "0.46875"], ["1/2", "0.50000"],
  ["17/32", "0.53125"], ["9/16", "0.56250"], ["19/32", "0.59375"], ["5/8", "0.62500"],
  ["21/32", "0.65625"], ["11/16", "0.68750"], ["23/32", "0.71875"], ["3/4", "0.75000"],
  ["25/32", "0.78125"], ["13/16", "0.81250"], ["27/32", "0.84375"], ["7/8", "0.87500"],
  ["29/32", "0.90625"], ["15/16", "0.93750"], ["31/32", "0.96875"], ["1", "1.00000"],
];

const profiles = {
  "Big G Steel Rail Survey": {
    summary:
      "Field-first setup aligned to the reporting backbone used in the attached runway survey documents.",
    checks: [
      {
        id: "runwayStraightness",
        label: "Quick straightness spot check",
        reference: "AIST TR-13 / field confirmation",
        inputs: [
          { id: "runout", label: "Measured offset over gauge length (in)", value: 0.21, step: "0.01" },
          { id: "runoutTol", label: "Allowed straightness offset (in)", value: 0.25, step: "0.01" },
        ],
        evaluate(values) {
          const actual = Math.abs(values.runout);
          return {
            measuredText: `${actual.toFixed(3)} in offset`,
            allowedText: `<= ${values.runoutTol.toFixed(3)} in`,
            pass: actual <= values.runoutTol,
          };
        },
      },
      {
        id: "beamRoll",
        label: "Runway beam roll spot check",
        reference: "ASTM A6 / report-level comparison",
        inputs: [
          { id: "roll", label: "Measured roll at critical point (deg)", value: 0.4, step: "0.01" },
          { id: "rollTol", label: "Allowed roll (deg)", value: 1.1, step: "0.01" },
        ],
        evaluate(values) {
          const actual = Math.abs(values.roll);
          return {
            measuredText: `${actual.toFixed(3)} deg`,
            allowedText: `<= ${values.rollTol.toFixed(3)} deg`,
            pass: actual <= values.rollTol,
          };
        },
      },
    ],
  },
};

const dom = {
  profileSelect: document.getElementById("profileSelect"),
  form: document.getElementById("measurementForm"),
  runBtn: document.getElementById("runCheck"),
  resultBody: document.querySelector("#resultTable tbody"),
  summary: document.getElementById("summary"),
  suggestionList: document.getElementById("suggestionList"),
  resultHighlights: document.getElementById("resultHighlights"),
  exportPdfBtn: document.getElementById("exportPdf"),
  projectSnapshot: document.getElementById("projectSnapshot"),
  columnsPerSide: document.getElementById("columnsPerSide"),
  measuredStationDistance: document.getElementById("measuredStationDistance"),
  directionPair: document.getElementById("directionPair"),
  buildLayoutBtn: document.getElementById("buildLayout"),
  layoutContainer: document.getElementById("layoutContainer"),
  fracToggle: document.getElementById("fracToggle"),
  fracBody: document.getElementById("fracBody"),
  surveyRunwayLengthFt: document.getElementById("surveyRunwayLengthFt"),
  surveyStationSpacingFt: document.getElementById("surveyStationSpacingFt"),
  surveyStartFt: document.getElementById("surveyStartFt"),
  surveyStraightTol: document.getElementById("surveyStraightTol"),
  surveyRateTolPer20: document.getElementById("surveyRateTolPer20"),
  surveyUseBeam: document.getElementById("surveyUseBeam"),
  beamWebThickness: document.getElementById("beamWebThickness"),
  beamInputReference: document.getElementById("beamInputReference"),
  eccZones: document.getElementById("eccZones"),
  buildSurveyStationsBtn: document.getElementById("buildSurveyStations"),
  evaluateSurveyBtn: document.getElementById("evaluateSurvey"),
  surveyStatus: document.getElementById("surveyStatus"),
  surveyTable: document.getElementById("surveyTable"),
  straightnessSvg: document.getElementById("straightnessSvg"),
  eccentricitySvg: document.getElementById("eccentricitySvg"),
};

const projectFieldIds = [
  "customerName",
  "facilityLocation",
  "serviceArea",
  "projectName",
  "surveyDate",
  "surveyors",
  "reportNumber",
  "craneManufacturer",
  "capacity",
  "spanLabel",
  "serviceClass",
  "runwayManufacturer",
  "railSize",
  "surveyDevice",
  "projectNotes",
];

const state = {
  latestRows: [],
  latestSurveySummary: null,
  latestStraightnessChartSvg: "",
  latestEccentricityChartSvg: "",
};

function $(id) {
  return document.getElementById(id);
}

function escHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[char]));
}

function toNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nearestFractionStringInches(valueIn) {
  const absValue = Math.abs(toNum(valueIn, 0));
  const options = [
    [0, "0\""], [0.0625, "1/16\""], [0.125, "1/8\""], [0.1875, "3/16\""],
    [0.25, "1/4\""], [0.3125, "5/16\""], [0.375, "3/8\""], [0.4375, "7/16\""],
    [0.5, "1/2\""], [0.625, "5/8\""], [0.75, "3/4\""], [0.875, "7/8\""],
    [1, "1\""], [1.125, "1 1/8\""], [1.25, "1 1/4\""], [1.5, "1 1/2\""],
    [2, "2\""], [3, "3\""],
  ];
  return options.reduce((best, entry) => {
    return Math.abs(entry[0] - absValue) < Math.abs(best[0] - absValue) ? entry : best;
  })[1];
}

function emptySvg(message) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="360" viewBox="0 0 1100 360">
    <rect x="0" y="0" width="1100" height="360" fill="white" />
    <text x="32" y="52" font-family="Arial" font-size="16" font-weight="700">${escHtml(message)}</text>
  </svg>`;
}

function setSvgInner(target, svgString) {
  if (!target) return;
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  target.innerHTML = doc.documentElement.innerHTML;
}

function parseZones(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [startFt, endFt, tolIn] = line.split(",").map((part) => toNum(part.trim(), NaN));
      if ([startFt, endFt, tolIn].every(Number.isFinite)) {
        return { startFt, endFt, tolIn };
      }
      return null;
    })
    .filter(Boolean);
}

function stationOffsets(segmentDistanceFt, stationDistanceFt) {
  const points = [];
  const length = toNum(segmentDistanceFt, 0);
  const spacing = toNum(stationDistanceFt, 0);
  if (length <= 0 || spacing <= 0) return points;

  for (let offset = 0; offset <= length + 1e-9; offset += spacing) {
    points.push(Number(Math.min(offset, length).toFixed(3)));
  }
  if (Math.abs(points[points.length - 1] - length) > 1e-6) {
    points.push(Number(length.toFixed(3)));
  }
  return [...new Set(points)];
}

function spanMeasurementOffsets(segmentDistanceFt, isLastSegment) {
  const segment = toNum(segmentDistanceFt, 0);
  if (segment <= 0) return [];
  const offsets = [0, Number((segment / 2).toFixed(3))];
  if (isLastSegment) offsets.push(Number(segment.toFixed(3)));
  return [...new Set(offsets)].sort((a, b) => a - b);
}

function sideConfig() {
  const [a = "North", b = "South"] = String(dom.directionPair.value || "North|South").split("|");
  return [
    { key: "sideA", label: a },
    { key: "sideB", label: b },
  ];
}

function getSegmentLengthFt(sideKey, segment) {
  return toNum($(`${sideKey}_actual_distance_${segment}`)?.value, 0);
}

function getSideElevationValue(sideKey, segment, offsetFt) {
  return toNum($(`${sideKey}_segment_${segment}_station_${offsetFt}`)?.value, 0);
}

function getRailToRailValue(segment, offsetFt) {
  return getSideElevationValue("sideA", segment, offsetFt) - getSideElevationValue("sideB", segment, offsetFt);
}

function getSpanMeasurementValue(segment, offsetFt) {
  return toNum($(`span_segment_${segment}_station_${offsetFt}`)?.value, 0);
}

function getReferenceSpanValue() {
  return toNum($("referenceSpan")?.value, 0);
}

function getSpanToleranceValue() {
  return toNum($("spanTol")?.value, 0.25);
}

function getBaselineToleranceValue() {
  return toNum($("baselineTol")?.value, 0.125);
}

function getCrossLevelToleranceValue() {
  return toNum($("crossLevelTol")?.value, 0.375);
}

function getBeamInputMode() {
  return dom.beamInputReference?.value || "webFace";
}

function getProjectData() {
  return projectFieldIds.reduce((acc, id) => {
    acc[id] = $(id)?.value?.trim() || "";
    return acc;
  }, {});
}

function formatProjectSnapshot(data = getProjectData()) {
  const lines = [
    data.customerName && `Customer: ${data.customerName}`,
    data.facilityLocation && `Location: ${data.facilityLocation}`,
    data.serviceArea && `Service: ${data.serviceArea}`,
    data.capacity && data.craneManufacturer && `Crane: ${data.craneManufacturer} / ${data.capacity}`,
    data.spanLabel && `Reference span: ${data.spanLabel}`,
    data.serviceClass && `Service class: ${data.serviceClass}`,
    data.railSize && `Rail size: ${data.railSize}`,
    data.surveyDevice && `Device / method: ${data.surveyDevice}`,
  ].filter(Boolean);

  return lines.length
    ? lines.join(" | ")
    : "Fill in the project and system data to create a cleaner customer-facing report header.";
}

function renderProjectSnapshot() {
  if (dom.projectSnapshot) {
    dom.projectSnapshot.textContent = formatProjectSnapshot();
  }
}

function buildFractionGrid() {
  if (!dom.fracBody) return;
  dom.fracBody.innerHTML = FRACTION_ROWS.map(([fraction, decimal]) => (
    `<div class="fracRow"><span>${fraction}</span><span>=</span><span>${decimal}</span></div>`
  )).join("");
}

function buildProfileOptions() {
  dom.profileSelect.innerHTML = Object.keys(profiles).map((name) => (
    `<option value="${escHtml(name)}">${escHtml(name)}</option>`
  )).join("");
}

function activeProfile() {
  return profiles[dom.profileSelect.value];
}

function renderForm() {
  const profile = activeProfile();
  if (!profile || !dom.form) return;

  dom.form.innerHTML = profile.checks.map((check) => check.inputs.map((input) => `
    <label>
      <span>${escHtml(check.label)} - ${escHtml(input.label)}</span>
      <input type="number" step="${escHtml(input.step || "0.1")}" id="${escHtml(check.id)}_${escHtml(input.id)}" value="${escHtml(input.value)}">
    </label>
  `).join("")).join("");
}

function autoPopulateSurveyRunwayLength() {
  let total = 0;
  const columnCount = toNum(dom.columnsPerSide.value, 0);
  for (let segment = 1; segment < columnCount; segment += 1) {
    total += getSegmentLengthFt("sideA", segment) || getSegmentLengthFt("sideB", segment);
  }
  if (total > 0) {
    dom.surveyRunwayLengthFt.value = String(total);
  }
}

function bindLayoutLiveCalculations() {
  dom.layoutContainer.querySelectorAll("input[type='number']").forEach((input) => {
    input.addEventListener("input", () => {
      updateRailToRailReadonlyValues();
      autoPopulateSurveyRunwayLength();
    });
  });
}

function updateRailToRailReadonlyValues() {
  const columns = toNum(dom.columnsPerSide.value, 0);
  const spacing = toNum(dom.measuredStationDistance.value, 10);
  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment),
    );
    if (segmentLen <= 0) continue;
    stationOffsets(segmentLen, spacing).forEach((offset) => {
      const output = $(`rail_to_rail_segment_${segment}_station_${offset}`);
      if (output) {
        output.value = getRailToRailValue(segment, offset).toFixed(3);
      }
    });
  }
}

function buildLayout() {
  dom.layoutContainer.innerHTML = "";

  const columns = toNum(dom.columnsPerSide.value, 0);
  const spacing = toNum(dom.measuredStationDistance.value, 0);
  if (columns < 2 || spacing <= 0) {
    dom.summary.textContent = "Columns per side must be 2 or more, and measured station distance must be greater than 0.";
    return;
  }

  const sides = sideConfig();

  sides.forEach((side) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "grid";
    fieldset.innerHTML = `<legend>${escHtml(side.label)} actual column-to-column distances (ft)</legend>`;

    for (let segment = 1; segment < columns; segment += 1) {
      const label = document.createElement("label");
      label.innerHTML = `
        <span>${escHtml(side.label)} Column ${segment} to ${segment + 1} actual distance (ft)</span>
        <input type="number" step="1" min="0" id="${escHtml(side.key)}_actual_distance_${segment}" value="60">
      `;
      fieldset.appendChild(label);
    }
    dom.layoutContainer.appendChild(fieldset);
  });

  const elevationSet = document.createElement("fieldset");
  elevationSet.className = "grid";
  elevationSet.innerHTML = "<legend>Top of Rail Elevation from Baseline</legend>";

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment) || 60;
      stationOffsets(actualDistance, spacing).forEach((offset) => {
        const label = document.createElement("label");
        label.innerHTML = `
          <span>${escHtml(side.label)} column ${segment} to ${segment + 1} elevation at ${offset} ft station (in)</span>
          <input type="number" step="0.01" id="${escHtml(side.key)}_segment_${segment}_station_${offset}" value="0">
        `;
        elevationSet.appendChild(label);
      });
    }
  });
  dom.layoutContainer.appendChild(elevationSet);

  const railSet = document.createElement("fieldset");
  railSet.className = "grid";
  railSet.innerHTML = "<legend>Rail-to-Rail Elevation Difference</legend>";
  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment) || 60,
      getSegmentLengthFt("sideB", segment) || 60,
    );
    stationOffsets(segmentLen, spacing).forEach((offset) => {
      const label = document.createElement("label");
      label.innerHTML = `
        <span>Rail-to-rail at segment ${segment}, ${offset} ft station (in)</span>
        <input type="number" class="readonlyCalc" id="rail_to_rail_segment_${segment}_station_${offset}" value="0" readonly>
      `;
      railSet.appendChild(label);
    });
  }
  dom.layoutContainer.appendChild(railSet);

  const spanSet = document.createElement("fieldset");
  spanSet.className = "grid";
  spanSet.innerHTML = "<legend>Span Measurements</legend>";
  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment) || 60,
      getSegmentLengthFt("sideB", segment) || 60,
    );
    const isLastSegment = segment === columns - 1;
    spanMeasurementOffsets(segmentLen, isLastSegment).forEach((offset) => {
      const label = document.createElement("label");
      label.innerHTML = `
        <span>Span measurement at segment ${segment}, ${offset} ft station (in)</span>
        <input type="number" step="0.01" id="span_segment_${segment}_station_${offset}" value="0">
      `;
      spanSet.appendChild(label);
    });
  }
  dom.layoutContainer.appendChild(spanSet);

  const toleranceSet = document.createElement("fieldset");
  toleranceSet.className = "grid";
  toleranceSet.innerHTML = `
    <legend>Acceptance Tolerances</legend>
    <label>
      <span>Reference span (in)</span>
      <input type="number" step="0.001" id="referenceSpan" value="1200">
    </label>
    <label>
      <span>Span tolerance (in)</span>
      <input type="number" step="0.001" id="spanTol" value="0.25">
    </label>
    <label>
      <span>Baseline tolerance (in)</span>
      <input type="number" step="0.001" id="baselineTol" value="0.125">
    </label>
    <label>
      <span>Rail-to-rail tolerance (in)</span>
      <input type="number" step="0.001" id="crossLevelTol" value="0.375">
    </label>
  `;
  dom.layoutContainer.appendChild(toleranceSet);

  bindLayoutLiveCalculations();
  updateRailToRailReadonlyValues();
  autoPopulateSurveyRunwayLength();
  dom.summary.textContent = "Layout built. Enter actual measurements, then run the compliance check.";
}

function collectValues(check) {
  return check.inputs.reduce((acc, input) => {
    acc[input.id] = toNum($(`${check.id}_${input.id}`)?.value, 0);
    return acc;
  }, {});
}

function evaluateElevationRows() {
  const sides = sideConfig();
  const columns = toNum(dom.columnsPerSide.value, 0);
  const spacing = toNum(dom.measuredStationDistance.value, 10);
  const baselineTol = getBaselineToleranceValue();
  const railTol = getCrossLevelToleranceValue();
  const referenceSpan = getReferenceSpanValue();
  const spanTol = getSpanToleranceValue();
  const rows = [];

  sides.forEach((side) => {
    for (let segment = 1; segment < columns; segment += 1) {
      const actualDistance = getSegmentLengthFt(side.key, segment);
      stationOffsets(actualDistance, spacing).forEach((offset) => {
        const raw = getSideElevationValue(side.key, segment, offset);
        const actual = Math.abs(raw);
        rows.push({
          check: `${side.label} segment ${segment} elevation at ${offset} ft`,
          measuredText: `${raw.toFixed(3)} in from baseline`,
          allowedText: `+/-${baselineTol.toFixed(3)} in`,
          pass: actual <= baselineTol,
          reference: "Top of rail baseline check",
        });
      });
    }
  });

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment),
    );
    stationOffsets(segmentLen, spacing).forEach((offset) => {
      const raw = getRailToRailValue(segment, offset);
      const actual = Math.abs(raw);
      rows.push({
        check: `Rail-to-rail at segment ${segment}, ${offset} ft`,
        measuredText: `${raw.toFixed(3)} in`,
        allowedText: `+/-${railTol.toFixed(3)} in`,
        pass: actual <= railTol,
        reference: "Rail-to-rail elevation difference",
      });
    });
  }

  for (let segment = 1; segment < columns; segment += 1) {
    const segmentLen = Math.min(
      getSegmentLengthFt("sideA", segment),
      getSegmentLengthFt("sideB", segment),
    );
    const isLastSegment = segment === columns - 1;
    spanMeasurementOffsets(segmentLen, isLastSegment).forEach((offset) => {
      const measuredSpan = getSpanMeasurementValue(segment, offset);
      const delta = measuredSpan - referenceSpan;
      rows.push({
        check: `Span at segment ${segment}, ${offset} ft`,
        measuredText: `${measuredSpan.toFixed(3)} in (${delta.toFixed(3)} in vs ref)`,
        allowedText: `${referenceSpan.toFixed(3)} +/- ${spanTol.toFixed(3)} in`,
        pass: Math.abs(delta) <= spanTol,
        reference: "Span verification",
      });
    });
  }
  return rows;
}

function suggestionForRow(row) {
  const text = row.check.toLowerCase();
  if (text.includes("elevation")) {
    return "Adjust rail seat elevation with shims or support corrections, then re-shoot the top of rail.";
  }
  if (text.includes("rail-to-rail")) {
    return "Correct cross-level by lowering the high rail or raising the low rail, then confirm the rail-to-rail reading again.";
  }
  if (text.includes("span")) {
    return "Adjust gauge at the failed point. If the span is wide, move rails in. If narrow, move rails out and remeasure.";
  }
  if (text.includes("straightness")) {
    return "Check alignment against the established reference line and adjust the support or rail position before resurveying.";
  }
  if (text.includes("roll")) {
    return "Review beam rotation at the support condition and confirm bearing, seat, and shim stack behavior.";
  }
  return "Review the failed point with engineering and resurvey after correction.";
}

function renderSuggestions(rows) {
  const failures = rows.filter((row) => !row.pass);
  if (!failures.length) {
    dom.suggestionList.innerHTML = "<li>All current checks passed. No adjustment actions are listed.</li>";
    return;
  }
  dom.suggestionList.innerHTML = failures.slice(0, 12).map((row) => (
    `<li><strong>${escHtml(row.check)}:</strong> ${escHtml(suggestionForRow(row))}</li>`
  )).join("");
}

function renderResultHighlights(rows) {
  const passed = rows.filter((row) => row.pass).length;
  const failed = rows.length - passed;
  const surveyFailures = state.latestSurveySummary ? state.latestSurveySummary.failCount : 0;
  const surveyStations = state.latestSurveySummary ? state.latestSurveySummary.stationCount : 0;

  dom.resultHighlights.innerHTML = [
    { klass: failed ? "bad" : "ok", value: failed, label: "Failed compliance checks" },
    { klass: passed ? "ok" : "warn", value: passed, label: "Passed compliance checks" },
    { klass: surveyFailures ? "bad" : "warn", value: surveyFailures, label: "Survey station failures" },
    { klass: surveyStations ? "warn" : "", value: surveyStations, label: "Survey stations built" },
  ].map((item) => `
    <article class="highlightCard ${item.klass}">
      <strong>${item.value}</strong>
      <span>${escHtml(item.label)}</span>
    </article>
  `).join("");
}

function runCompliance() {
  const profile = activeProfile();
  const rows = [];

  if (profile) {
    profile.checks.forEach((check) => {
      const result = check.evaluate(collectValues(check));
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
  state.latestRows = rows;

  dom.resultBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escHtml(row.check)}</td>
      <td>${escHtml(row.measuredText)}</td>
      <td>${escHtml(row.allowedText)}</td>
      <td class="status ${row.pass ? "pass" : "fail"}">${row.pass ? "PASS" : "FAIL"}</td>
      <td>${escHtml(row.reference)}</td>
    </tr>
  `).join("");

  const passed = rows.filter((row) => row.pass).length;
  dom.summary.textContent = `${passed} of ${rows.length} compliance checks passed. Review failed points before customer handoff.`;
  renderSuggestions(rows);
  renderResultHighlights(rows);
}

function buildSurveyStations() {
  const tbody = dom.surveyTable?.querySelector("tbody");
  if (!tbody) return;

  const startFt = toNum(dom.surveyStartFt.value, 0);
  const lenFt = toNum(dom.surveyRunwayLengthFt.value, 0);
  const stepFt = toNum(dom.surveyStationSpacingFt.value, 10);
  const useBeam = dom.surveyUseBeam.value === "yes";

  if (lenFt <= 0 || stepFt <= 0) {
    dom.surveyStatus.textContent = "Enter a valid runway length and station spacing first.";
    return;
  }

  dom.surveyTable.closest(".panel").classList.toggle("beamHidden", !useBeam);

  const stations = [];
  for (let ft = startFt; ft <= startFt + lenFt + 1e-9; ft += stepFt) {
    stations.push(Number(ft.toFixed(3)));
  }
  const last = stations[stations.length - 1];
  const targetEnd = Number((startFt + lenFt).toFixed(3));
  if (Math.abs((last ?? 0) - targetEnd) > 1e-6) stations.push(targetEnd);

  tbody.innerHTML = stations.map((ft) => `
    <tr>
      <td>${ft}</td>
      <td><input data-k="railN" type="number" step="0.01" value="0"></td>
      <td><input data-k="railS" type="number" step="0.01" value="0"></td>
      <td class="beamCell"><input data-k="beamN" type="number" step="0.01" value="0"></td>
      <td class="beamCell"><input data-k="beamS" type="number" step="0.01" value="0"></td>
      <td class="pfN">-</td>
      <td class="pfS">-</td>
      <td class="rateN">-</td>
      <td class="rateS">-</td>
    </tr>
  `).join("");

  state.latestSurveySummary = {
    stationCount: stations.length,
    failCount: 0,
    northStatus: "Not run",
    southStatus: "Not run",
  };
  dom.surveyStatus.textContent = `Stations built: ${stations.length} rows from ${startFt} ft to ${targetEnd} ft at ${stepFt} ft spacing.`;
  renderResultHighlights(state.latestRows);
  setSvgInner(dom.straightnessSvg, emptySvg("Enter station offsets and click Evaluate and Render."));
  setSvgInner(dom.eccentricitySvg, emptySvg("Beam eccentricity chart will render when beam inputs are enabled."));
}

function collectSurveyTable() {
  const rows = Array.from(dom.surveyTable?.querySelectorAll("tbody tr") || []);
  const data = { stationFt: [], railN: [], railS: [], beamN: [], beamS: [] };
  rows.forEach((row) => {
    const ft = toNum(row.children[0].textContent, NaN);
    if (!Number.isFinite(ft)) return;
    const read = (key) => toNum(row.querySelector(`input[data-k="${key}"]`)?.value, 0);
    data.stationFt.push(ft);
    data.railN.push(read("railN"));
    data.railS.push(read("railS"));
    data.beamN.push(read("beamN"));
    data.beamS.push(read("beamS"));
  });
  return data.stationFt.length ? data : null;
}

function toleranceAtStation(tolWindow, stationFt) {
  if (!tolWindow) return 0;
  if (tolWindow.type === "constant") return tolWindow.tolIn;
  const zone = tolWindow.zones.find((item) => stationFt >= item.startFt && stationFt <= item.endFt);
  return zone ? zone.tolIn : tolWindow.zones[tolWindow.zones.length - 1]?.tolIn || 0;
}

function buildChartSvg({ title, leftLabel, rightLabel, stationFt, series, tolWindow }) {
  if (!stationFt || stationFt.length < 2) return emptySvg("Not enough chart data.");

  const width = 1100;
  const height = 360;
  const margin = { l: 78, r: 24, t: 58, b: 54 };
  const plotWidth = width - margin.l - margin.r;
  const plotHeight = height - margin.t - margin.b;
  const xMin = Math.min(...stationFt);
  const xMax = Math.max(...stationFt);
  const xSpan = Math.max(1e-6, xMax - xMin);
  const tolValues = stationFt.map((station) => Math.abs(toleranceAtStation(tolWindow, station)));
  const maxSeriesValue = Math.max(
    ...tolValues,
    ...series.flatMap((set) => set.values.map((value) => Math.abs(toNum(value, 0)))),
    0.4,
  );
  const yRange = Math.ceil(maxSeriesValue / 0.1) * 0.1;
  const yMin = -yRange;
  const yMax = yRange;

  const xToPx = (value) => margin.l + ((value - xMin) / xSpan) * plotWidth;
  const yToPx = (value) => margin.t + (1 - ((value - yMin) / (yMax - yMin))) * plotHeight;

  const ticks = [];
  for (let value = yMin; value <= yMax + 1e-9; value += 0.1) {
    ticks.push(Number(value.toFixed(2)));
  }

  const pathFor = (points) => points.map((value, index) => (
    `${index === 0 ? "M" : "L"} ${xToPx(stationFt[index])} ${yToPx(value)}`
  )).join(" ");

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
      <text x="${margin.l}" y="26" font-family="Arial" font-size="18" font-weight="800">${escHtml(title)}</text>
      <text x="${margin.l}" y="44" font-family="Arial" font-size="12">${escHtml(leftLabel)}</text>
      <text x="${width - margin.r}" y="44" text-anchor="end" font-family="Arial" font-size="12">${escHtml(rightLabel)}</text>
      <rect x="${margin.l}" y="${margin.t}" width="${plotWidth}" height="${plotHeight}" fill="white" stroke="#8ea0b7" />
  `;

  ticks.forEach((tick) => {
    const y = yToPx(tick);
    svg += `
      <line x1="${margin.l}" y1="${y}" x2="${margin.l + plotWidth}" y2="${y}" stroke="${Math.abs(tick) < 1e-9 ? "#61758c" : "#e1e7ef"}" stroke-width="${Math.abs(tick) < 1e-9 ? "1.6" : "1"}" />
      <text x="${margin.l - 10}" y="${y + 4}" text-anchor="end" font-family="Arial" font-size="10" fill="#5b6577">${tick.toFixed(1)}</text>
    `;
  });

  stationFt.forEach((station, index) => {
    const x = xToPx(station);
    svg += `<line x1="${x}" y1="${margin.t + plotHeight}" x2="${x}" y2="${margin.t + plotHeight + 6}" stroke="#7b8798" />`;
    if (stationFt.length <= 16 || index === 0 || index === stationFt.length - 1 || index % 2 === 0) {
      svg += `<text x="${x}" y="${margin.t + plotHeight + 20}" text-anchor="middle" font-family="Arial" font-size="10" fill="#5b6577">${station.toFixed(0)}'</text>`;
    }
  });

  const upperTol = stationFt.map((station) => toleranceAtStation(tolWindow, station));
  const lowerTol = upperTol.map((value) => -value);
  svg += `<path d="${pathFor(upperTol)}" fill="none" stroke="#c95f5f" stroke-width="1.4" stroke-dasharray="4 4" />`;
  svg += `<path d="${pathFor(lowerTol)}" fill="none" stroke="#c95f5f" stroke-width="1.4" stroke-dasharray="4 4" />`;

  series.forEach((set) => {
    svg += `<path d="${pathFor(set.values)}" fill="none" stroke="${set.stroke}" stroke-width="${set.width}" ${set.dash ? `stroke-dasharray="${set.dash}"` : ""} />`;
    set.values.forEach((value, index) => {
      svg += `<circle cx="${xToPx(stationFt[index])}" cy="${yToPx(value)}" r="2.8" fill="${set.stroke}" />`;
    });
  });

  svg += `
      <line x1="${margin.l}" y1="${height - 16}" x2="${margin.l + 24}" y2="${height - 16}" stroke="#19364c" stroke-width="2.4" />
      <text x="${margin.l + 30}" y="${height - 12}" font-family="Arial" font-size="10">North / Line 1</text>
      <line x1="${margin.l + 140}" y1="${height - 16}" x2="${margin.l + 164}" y2="${height - 16}" stroke="#c47a3a" stroke-width="2.2" stroke-dasharray="6 4" />
      <text x="${margin.l + 170}" y="${height - 12}" font-family="Arial" font-size="10">South / Line 2</text>
    </svg>
  `;

  return svg;
}

function evaluateAndRenderSurvey() {
  const data = collectSurveyTable();
  if (!data || data.stationFt.length < 2) {
    dom.surveyStatus.textContent = "Build the survey stations first, then enter measurements.";
    return;
  }

  const straightTol = toNum(dom.surveyStraightTol.value, 0.375);
  const rateTol = toNum(dom.surveyRateTolPer20.value, 0.25);
  const useBeam = dom.surveyUseBeam.value === "yes";
  const beamThickness = toNum(dom.beamWebThickness.value, 0);
  const beamMode = getBeamInputMode();
  const zones = parseZones(dom.eccZones.value);

  const rateN = [];
  const rateS = [];
  for (let index = 0; index < data.stationFt.length; index += 1) {
    if (index === 0) {
      rateN.push(0);
      rateS.push(0);
      continue;
    }
    const deltaFt = Math.max(1e-6, data.stationFt[index] - data.stationFt[index - 1]);
    rateN.push(Math.abs(data.railN[index] - data.railN[index - 1]) * (20 / deltaFt));
    rateS.push(Math.abs(data.railS[index] - data.railS[index - 1]) * (20 / deltaFt));
  }

  let northOk = true;
  let southOk = true;
  let failCount = 0;

  const rows = Array.from(dom.surveyTable.querySelectorAll("tbody tr"));
  rows.forEach((row, index) => {
    const passN = Math.abs(data.railN[index]) <= straightTol && rateN[index] <= rateTol;
    const passS = Math.abs(data.railS[index]) <= straightTol && rateS[index] <= rateTol;
    northOk = northOk && passN;
    southOk = southOk && passS;
    if (!passN) failCount += 1;
    if (!passS) failCount += 1;

    row.querySelector(".pfN").textContent = passN ? "PASS" : "FAIL";
    row.querySelector(".pfN").style.color = passN ? "#146c43" : "#b42318";
    row.querySelector(".pfS").textContent = passS ? "PASS" : "FAIL";
    row.querySelector(".pfS").style.color = passS ? "#146c43" : "#b42318";
    row.querySelector(".rateN").textContent = rateN[index].toFixed(3);
    row.querySelector(".rateN").style.color = rateN[index] <= rateTol ? "#172033" : "#b42318";
    row.querySelector(".rateS").textContent = rateS[index].toFixed(3);
    row.querySelector(".rateS").style.color = rateS[index] <= rateTol ? "#172033" : "#b42318";
  });

  state.latestStraightnessChartSvg = buildChartSvg({
    title: "Runway Straightness Survey",
    leftLabel: `Tolerance window: +/-${straightTol.toFixed(3)} in`,
    rightLabel: `Rate of change limit: ${rateTol.toFixed(3)} in / 20 ft`,
    stationFt: data.stationFt,
    series: [
      { values: data.railN, stroke: "#19364c", width: 2.6 },
      { values: data.railS, stroke: "#c47a3a", width: 2.2, dash: "6 4" },
    ],
    tolWindow: { type: "constant", tolIn: straightTol },
  });
  setSvgInner(dom.straightnessSvg, state.latestStraightnessChartSvg);

  if (useBeam) {
    const beamN = beamMode === "centerline"
      ? data.beamN
      : data.beamN.map((value) => toNum(value, 0) + beamThickness / 2);
    const beamS = beamMode === "centerline"
      ? data.beamS
      : data.beamS.map((value) => toNum(value, 0) + beamThickness / 2);
    const eccN = data.railN.map((value, index) => value - beamN[index]);
    const eccS = data.railS.map((value, index) => value - beamS[index]);
    const toleranceWindow = zones.length ? { type: "zones", zones } : { type: "constant", tolIn: 0.5 };

    state.latestEccentricityChartSvg = buildChartSvg({
      title: "Beam-to-Rail Eccentricity Survey",
      leftLabel: beamMode === "centerline"
        ? "Beam input basis: centerline entered directly"
        : "Beam input basis: web face entered, centerline derived from web thickness / 2",
      rightLabel: zones.length ? "Zone tolerances active" : "Default tolerance band shown",
      stationFt: data.stationFt,
      series: [
        { values: eccN, stroke: "#19364c", width: 2.6 },
        { values: eccS, stroke: "#c47a3a", width: 2.2, dash: "6 4" },
      ],
      tolWindow: toleranceWindow,
    });
    setSvgInner(dom.eccentricitySvg, state.latestEccentricityChartSvg);
  } else {
    state.latestEccentricityChartSvg = emptySvg("Beam inputs are off. Turn them on to render eccentricity.");
    setSvgInner(dom.eccentricitySvg, state.latestEccentricityChartSvg);
  }

  state.latestSurveySummary = {
    stationCount: data.stationFt.length,
    failCount,
    northStatus: northOk ? "PASS" : "FAIL",
    southStatus: southOk ? "PASS" : "FAIL",
  };

  dom.surveyStatus.textContent = `Survey evaluated. North line: ${state.latestSurveySummary.northStatus}. South line: ${state.latestSurveySummary.southStatus}.`;
  renderResultHighlights(state.latestRows);
}

function buildReportHtml() {
  const project = getProjectData();
  const rowsHtml = state.latestRows.length ? state.latestRows.map((row) => `
    <tr>
      <td>${escHtml(row.check)}</td>
      <td>${escHtml(row.measuredText)}</td>
      <td>${escHtml(row.allowedText)}</td>
      <td>${row.pass ? "PASS" : "FAIL"}</td>
      <td>${escHtml(row.reference)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5">No compliance check has been run yet.</td></tr>`;

  const surveySummaryHtml = state.latestSurveySummary ? `
    <p><strong>Survey stations:</strong> ${state.latestSurveySummary.stationCount}</p>
    <p><strong>North line:</strong> ${state.latestSurveySummary.northStatus}</p>
    <p><strong>South line:</strong> ${state.latestSurveySummary.southStatus}</p>
    <p><strong>Survey failures:</strong> ${state.latestSurveySummary.failCount}</p>
  ` : "<p>No station-by-station survey has been evaluated yet.</p>";

  const suggestionsHtml = dom.suggestionList?.innerHTML || "<li>No suggestions listed.</li>";

  return `
    <html>
      <head>
        <title>${escHtml(project.projectName || "Big G Steel Survey Report")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color: #172033; }
          h1, h2 { margin: 0 0 8px; }
          .meta, .box { margin-bottom: 18px; }
          .box { border: 1px solid #d7deeb; border-radius: 10px; padding: 12px; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d7deeb; padding: 6px 8px; text-align: left; font-size: 12px; vertical-align: top; }
          th { background: #f5f8fc; }
          svg { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <h1>Big G Steel Rail Survey Report</h1>
        <div class="meta">
          <strong>Project:</strong> ${escHtml(project.projectName || "Unnamed Project")}<br>
          <strong>Customer:</strong> ${escHtml(project.customerName || "Not entered")}<br>
          <strong>Location:</strong> ${escHtml(project.facilityLocation || "Not entered")}<br>
          <strong>Service / Bay:</strong> ${escHtml(project.serviceArea || "Not entered")}<br>
          <strong>Survey Date:</strong> ${escHtml(project.surveyDate || "Not entered")}<br>
          <strong>Surveyors:</strong> ${escHtml(project.surveyors || "Not entered")}<br>
          <strong>Report / Job Number:</strong> ${escHtml(project.reportNumber || "Not entered")}<br>
          <strong>System Snapshot:</strong> ${escHtml(formatProjectSnapshot(project))}
        </div>

        <div class="box">
          <h2>Scope Backbone</h2>
          <p>This field tool follows the same reporting backbone reflected in the attached runway survey PDFs: project context, system data, measured stationing, tolerance checks, pass/fail review, and adjustment guidance.</p>
        </div>

        <div class="box">
          <h2>Compliance Results</h2>
          <table>
            <thead>
              <tr><th>Check</th><th>Measured</th><th>Allowed</th><th>Status</th><th>Reference</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>

        <div class="box">
          <h2>Station Survey Summary</h2>
          ${surveySummaryHtml}
        </div>

        <div class="box">
          <h2>Straightness Chart</h2>
          ${state.latestStraightnessChartSvg || emptySvg("No straightness chart rendered yet.")}
        </div>

        <div class="box">
          <h2>Eccentricity Chart</h2>
          ${state.latestEccentricityChartSvg || emptySvg("No eccentricity chart rendered yet.")}
        </div>

        <div class="box">
          <h2>Field Adjustment Suggestions</h2>
          <ul>${suggestionsHtml}</ul>
        </div>
      </body>
    </html>
  `;
}

function exportPdfReport() {
  const popup = window.open("", "_blank");
  if (!popup) {
    dom.summary.textContent = "The browser blocked the report window. Allow popups to print or save the report.";
    return;
  }
  popup.document.write(buildReportHtml());
  popup.document.close();
  popup.focus();
  popup.print();
}

function initFractionToggle() {
  if (!dom.fracToggle || !dom.fracBody) return;
  const setState = (isOpen) => {
    dom.fracBody.hidden = !isOpen;
    dom.fracToggle.setAttribute("aria-expanded", String(isOpen));
    dom.fracToggle.textContent = isOpen ? "Hide" : "Show";
  };
  setState(window.matchMedia("(min-width: 1000px)").matches);
  dom.fracToggle.addEventListener("click", () => setState(dom.fracBody.hidden));
}

function setDefaultDate() {
  const today = new Date();
  const year = String(today.getFullYear());
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateField = $("surveyDate");
  if (dateField && !dateField.value) {
    dateField.value = `${year}-${month}-${day}`;
  }
}

function bindProjectFields() {
  projectFieldIds.forEach((id) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener("input", renderProjectSnapshot);
  });
}

function init() {
  buildFractionGrid();
  initFractionToggle();
  buildProfileOptions();
  renderForm();
  setDefaultDate();
  renderProjectSnapshot();
  buildLayout();
  buildSurveyStations();
  setSvgInner(dom.straightnessSvg, emptySvg("Enter station offsets and click Evaluate and Render."));
  setSvgInner(dom.eccentricitySvg, emptySvg("Beam eccentricity chart will render when beam inputs are enabled."));

  dom.profileSelect.addEventListener("change", () => {
    renderForm();
    dom.summary.textContent = `${activeProfile().summary} Run the compliance check after entering measurements.`;
  });

  dom.buildLayoutBtn.addEventListener("click", buildLayout);
  dom.runBtn.addEventListener("click", runCompliance);
  dom.buildSurveyStationsBtn.addEventListener("click", buildSurveyStations);
  dom.evaluateSurveyBtn.addEventListener("click", evaluateAndRenderSurvey);
  dom.exportPdfBtn.addEventListener("click", exportPdfReport);
  dom.surveyUseBeam.addEventListener("change", buildSurveyStations);
  dom.beamInputReference.addEventListener("change", buildSurveyStations);
  bindProjectFields();
  renderResultHighlights([]);
}

window.addEventListener("load", init);
