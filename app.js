/* app.js — Big G Steel LLC TR-13 / CMAA field check
   - Core TR-13/CMAA checks + layout builder
   - Cross-level (TOP OF RAIL to TOP OF RAIL) markup diagram SVG for export
   - Station-by-station STRAIGHTNESS + ECCENTRICITY:
       * Auto station table build (0, 10, 20...)
       * Field inputs (Rail N/S, optional Beam N/S)
       * PASS/FAIL per station and overall
       * Rate-of-change check (in per 20 ft)
       * Survey-style SVG charts
   - Export-to-PDF popup includes diagrams + charts (inline SVG)
*/

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

// Station-by-station survey UI
const surveyRunwayLengthFtEl = document.getElementById("surveyRunwayLengthFt");
const surveyStationSpacingFtEl = document.getElementById("surveyStationSpacingFt");
const surveyStartFtEl = document.getElementById("surveyStartFt");
const surveyStraightTolEl = document.getElementById("surveyStraightTol");
const surveyRateTolPer20El = document.getElementById("surveyRateTolPer20");
const surveyUseBeamEl = document.getElementById("surveyUseBeam");
const eccZonesEl = document.getElementById("eccZones");

const buildSurveyStationsBtn = document.getElementById("buildSurveyStations");
const evaluateSurveyBtn = document.getElementById("evaluateSurvey");
const surveyStatusEl = document.getElementById("surveyStatus");

const surveyTable = document.getElementById("surveyTable");
const surveyTbody = surveyTable?.querySelector("tbody");

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
    console.error("App init failed. Missing DOM:", missing);
    if (summary) summary.textContent = `App error: Missing required elements (${missing.join(", ")}).`;
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
  for (const f of fracMap) if (Math.abs(f.val - abs) < Math.abs(best.val - abs)) best = f;
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
    .map(l => l.trim())
    .filter(Boolean);

  const zones = [];
  for (const line of lines) {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 3) continue;
    const startFt = toNum(parts[0], NaN);
    const endFt = toNum(parts[1], NaN);
    const tolIn = toNum(parts[2], NaN);
    if ([startFt, endFt, tolIn].every(Number.isFinite)) zones.push({ startFt, endFt, tolIn });
  }
  return zones.length ? zones : null;
}

function tolAt(ft, zones, fallbackTol) {
  if (!zones) return fallbackTol;
  const z = zones.find(z => ft >= z.startFt && ft <= z.endFt);
  return z ? z.tolIn : fallbackTol;
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
      label.innerHTML = `${escHtml(check.label)} — ${escHtml(input.label)}
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
    summary.textContent = "Columns per side must be 2+ and measured station distance must be > 0.";
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
    "<legend>Side elevation from Baseline (TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>";

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
  crossLevelMeasurements.innerHTML = `<legend>${escHtml(sides[0].label)} to ${escHtml(sides[1].label)} CROSS-LEVEL (TOP OF RAIL to TOP OF RAIL) — stations start at 0 ft, then measured station distance</legend>`;

  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = toNum(document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 60, 60);
    const sideBDesignDistance = toNum(document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 60, 60);

    stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance).forEach((offset) => {
      const label = document.createElement("label");
      label.innerHTML = `${escHtml(sides[0].label)}${segment} to ${escHtml(sides[1].label)}${segment} cross-level at ${offset} ft station (in)
        <input type="number" step="any" id="cross_segment_${segment}_station_${offset}" value="0" />`;
      crossLevelMeasurements.append(label);
    });
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
      Cross-level tolerance (in)
      <input type="number" step="any" min="0" id="crossLevelTol" value="0.375" />
    </label>`;
  layoutContainer.append(tolerances);

  summary.textContent = "Layout built. Enter values, then run compliance check.";
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
        reference: "TR-13 distance verification",
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
          reference: "TR-13 baseline elevation (TOP OF RAIL)",
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
      const crossLevelValue = Math.abs(toNum(document.getElementById(`cross_segment_${segment}_station_${offset}`)?.value, 0));

      rows.push({
        check: `${sides[0].label}${segment} to ${sides[1].label}${segment} cross-level at ${offset} ft`,
        measuredText: `${crossLevelValue.toFixed(3)} in cross-level`,
        allowedText: `≤ ${crossLevelTol.toFixed(3)} in`,
        pass: crossLevelValue <= crossLevelTol,
        reference: "TR-13 cross-level (TOP OF RAIL to TOP OF RAIL)",
      });
    });
  }

  return rows;
}

/* ---------------- Suggestions ---------------- */

function suggestionForRow(row) {
  const check = row.check.toLowerCase();

  if (check.includes("distance check")) return "Verify column plumbness/anchors; re-align support steel before final tightening.";
  if (check.includes("baseline check")) return "Adjust rail seat elevation with shims/grout; re-shoot elevations at affected stations.";
  if (check.includes("cross-level")) return "Correct cross-level by raising low side or lowering high side; re-check from same TOP OF RAIL datum.";
  if (check.includes("span deviation")) return "Reconfirm gauge control lines and shift runway members to restore design span.";
  if (check.includes("straightness")) return "Check alignment/stringline and adjust connection points; remeasure.";

  return "Review with engineering; correct geometry/elevation source; remeasure before acceptance.";
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

/* ---------------- Cross-level markup diagram (for export) ---------------- */

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
      pts.push({ stationFt: cumulativeFt + offsetFt, valueIn: v });
    });

    cumulativeFt += segmentLenFt;
  }

  return pts;
}

function buildCrossLevelDiagramSvgString() {
  const sides = sideConfig();
  const tol = toNum(document.getElementById("crossLevelTol")?.value, 0.375);

  const pts = collectCrossLevelSeries();
  if (!pts.length) return emptySvg("No cross-level data available.");

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

/* ---------------- Survey station table build ---------------- */

function buildSurveyStations() {
  if (!surveyTbody) return;

  const startFt = toNum(surveyStartFtEl?.value, 0);
  const lenFt = toNum(surveyRunwayLengthFtEl?.value, 0);
  const stepFt = toNum(surveyStationSpacingFtEl?.value, 10);
  const useBeam = (surveyUseBeamEl?.value === "yes");

  if (lenFt <= 0 || stepFt <= 0) {
    if (surveyStatusEl) surveyStatusEl.textContent = "Enter a valid runway length and station spacing.";
    return;
  }

  // Toggle beam columns visibility
  const card = surveyTable.closest(".card");
  if (card) card.classList.toggle("beamHidden", !useBeam);

  surveyTbody.innerHTML = "";

  const stations = [];
  for (let ft = startFt; ft <= startFt + lenFt + 1e-9; ft += stepFt) stations.push(Number(ft.toFixed(3)));

  for (const ft of stations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ft}</td>
      <td><input data-k="railN" data-ft="${ft}" type="number" step="any" value="0"></td>
      <td><input data-k="railS" data-ft="${ft}" type="number" step="any" value="0"></td>
      <td class="beamCell"><input data-k="beamN" data-ft="${ft}" type="number" step="any" value="0"></td>
      <td class="beamCell"><input data-k="beamS" data-ft="${ft}" type="number" step="any" value="0"></td>
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

  // Reset charts
  setSvgInner(straightnessSvgEl, emptySvg("Enter station offsets and click Evaluate & Render."));
  setSvgInner(eccentricitySvgEl, emptySvg("Eccentricity disabled unless Beam inputs enabled."));
}

/* ---------------- Survey data collection ---------------- */

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

    const hasBeamN = !!tr.querySelector(`input[data-k="beamN"]`);
    const hasBeamS = !!tr.querySelector(`input[data-k="beamS"]`);

    beamN.push(hasBeamN ? get("beamN") : null);
    beamS.push(hasBeamS ? get("beamS") : null);
  }

  return { stationFt, railN, railS, beamN, beamS };
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
  tolWindow,         // { type:"constant", tolIn } OR { type:"zones", zones:[{startFt,endFt,tolIn}] }
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

  function tolAtStation(ft) {
    if (!tolWindow) return 0;
    if (tolWindow.type === "constant") return tolWindow.tolIn;
    if (tolWindow.type === "zones") {
      const z = tolWindow.zones.find(z => ft >= z.startFt && ft <= z.endFt);
      return z ? z.tolIn : (tolWindow.zones[tolWindow.zones.length - 1]?.tolIn ?? 0);
    }
    return 0;
  }

  const upper = stationFt.map(ft => tolAtStation(ft));
  const lower = upper.map(v => -v);

  const xGridStep = 50;
  const yGridStep = 0.5;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
    <text x="${margin.l}" y="26" font-family="Arial" font-size="18" font-weight="800">${escHtml(title)}</text>
    <text x="${margin.l}" y="46" font-family="Arial" font-size="12">${escHtml(subtitleLeft || "")}</text>
    <text x="${W - margin.r}" y="46" font-family="Arial" font-size="12" text-anchor="end">${escHtml(subtitleRight || "")}</text>

    <rect x="${margin.l}" y="${margin.t}" width="${plotW}" height="${plotH}" fill="white" stroke="black" stroke-width="1"/>
  `);

  for (let x = Math.ceil(xMin / xGridStep) * xGridStep; x <= xMax; x += xGridStep) {
    const px = xToPx(x);
    parts.push(`<line x1="${px}" y1="${margin.t}" x2="${px}" y2="${margin.t + plotH}" stroke="#999" stroke-width="0.5" stroke-dasharray="4 4"/>`);
    parts.push(`<text x="${px}" y="${margin.t + plotH + 18}" font-family="Arial" font-size="10" text-anchor="middle">${x}</text>`);
  }
  parts.push(`<text x="${margin.l}" y="${margin.t + plotH + 38}" font-family="Arial" font-size="10">ft</text>`);

  for (let y = Math.ceil(yMin / yGridStep) * yGridStep; y <= yMax; y += yGridStep) {
    const py = yToPx(y);
    parts.push(`<line x1="${margin.l}" y1="${py}" x2="${margin.l + plotW}" y2="${py}" stroke="#ddd" stroke-width="0.7"/>`);
    parts.push(`<text x="${margin.l - 10}" y="${py + 3}" font-family="Arial" font-size="10" text-anchor="end">${y.toFixed(1)}</text>`);
  }
  parts.push(`<text x="${margin.l - 40}" y="${margin.t - 10}" font-family="Arial" font-size="10">in</text>`);

  const polyPath = (yArr) => yArr.map((yy, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(yy)}`).join(" ");
  const tolPath = (arr) => arr.map((t, i) => `${i === 0 ? "M" : "L"} ${xToPx(stationFt[i])} ${yToPx(t)}`).join(" ");

  if (tolWindow) {
    parts.push(`<path d="${tolPath(upper)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    parts.push(`<path d="${tolPath(lower)}" fill="none" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
  }

  series.forEach((s) => {
    const stroke = s.style?.stroke || "black";
    const width = s.style?.width || 2.5;
    const dash = s.style?.dash || "";
    parts.push(`<path d="${polyPath(s.y)}" fill="none" stroke="${stroke}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`);
  });

  if (highlightMax) {
    series.forEach((s) => {
      let maxIdx = 0;
      let maxAbs = 0;
      for (let i = 0; i < s.y.length; i++) {
        const a = Math.abs(s.y[i]);
        if (a > maxAbs) { maxAbs = a; maxIdx = i; }
      }
      const px = xToPx(stationFt[maxIdx]);
      const py = yToPx(s.y[maxIdx]);
      parts.push(`<circle cx="${px}" cy="${py}" r="4" fill="red"/>`);
      parts.push(`<text x="${px + 8}" y="${py - 8}" font-family="Arial" font-size="10">${maxAbs.toFixed(2)} in</text>`);
    });
  }

  // Legend
  const legendX = margin.l + 10;
  const legendY = margin.t + plotH + 8;
  series.forEach((s, i) => {
    const y = legendY + (i * 16);
    parts.push(`<line x1="${legendX}" y1="${y}" x2="${legendX + 30}" y2="${y}" stroke="${s.style?.stroke || "black"}" stroke-width="${s.style?.width || 2.5}" ${s.style?.dash ? `stroke-dasharray="${s.style.dash}"` : ""}/>`);
    parts.push(`<text x="${legendX + 36}" y="${y + 4}" font-family="Arial" font-size="11">${escHtml(s.name)}</text>`);
  });
  if (tolWindow) {
    const y = legendY + (series.length * 16);
    parts.push(`<line x1="${legendX}" y1="${y}" x2="${legendX + 30}" y2="${y}" stroke="red" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    parts.push(`<text x="${legendX + 36}" y="${y + 4}" font-family="Arial" font-size="11">Tolerance Window</text>`);
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/* ---------------- Survey evaluation + pass/fail ---------------- */

function evaluateAndRenderSurvey() {
  const data = collectSurveyTable();
  if (!data || data.stationFt.length < 2) {
    if (surveyStatusEl) surveyStatusEl.textContent = "Build stations first, then enter measurements.";
    return;
  }

  const tol = toNum(surveyStraightTolEl?.value, 0.375);
  const rateTol = toNum(surveyRateTolPer20El?.value, 0.25);
  const useBeam = (surveyUseBeamEl?.value === "yes");
  const zones = parseZones(eccZonesEl?.value);

  // Rate-of-change normalized to 20 ft: |dy| * (20/dx)
  const rateN = [];
  const rateS = [];
  for (let i = 0; i < data.stationFt.length; i++) {
    if (i === 0) { rateN.push(0); rateS.push(0); continue; }
    const dx = Math.max(1e-6, data.stationFt[i] - data.stationFt[i - 1]);
    rateN.push(Math.abs(data.railN[i] - data.railN[i - 1]) * (20 / dx));
    rateS.push(Math.abs(data.railS[i] - data.railS[i - 1]) * (20 / dx));
  }

  let passNAll = true;
  let passSAll = true;

  const trs = Array.from(surveyTbody.querySelectorAll("tr"));
  trs.forEach((tr, i) => {
    const nMagPass = Math.abs(data.railN[i]) <= tol;
    const sMagPass = Math.abs(data.railS[i]) <= tol;

    const nRatePass = rateN[i] <= rateTol;
    const sRatePass = rateS[i] <= rateTol;

    const nOK = nMagPass && nRatePass;
    const sOK = sMagPass && sRatePass;

    passNAll = passNAll && nOK;
    passSAll = passSAll && sOK;

    const pfN = tr.querySelector(".pfN");
    const pfS = tr.querySelector(".pfS");
    const rNCell = tr.querySelector(".rateN");
    const rSCell = tr.querySelector(".rateS");

    if (pfN) { pfN.textContent = nOK ? "PASS" : "FAIL"; pfN.style.color = nOK ? "#0a7a2f" : "#c1121f"; }
    if (pfS) { pfS.textContent = sOK ? "PASS" : "FAIL"; pfS.style.color = sOK ? "#0a7a2f" : "#c1121f"; }

    if (rNCell) { rNCell.textContent = rateN[i].toFixed(3); rNCell.style.color = nRatePass ? "#111" : "#c1121f"; }
    if (rSCell) { rSCell.textContent = rateS[i].toFixed(3); rSCell.style.color = sRatePass ? "#111" : "#c1121f"; }
  });

  // Straightness chart Y range
  const maxDev = Math.max(seriesMaxAbs(data.railN), seriesMaxAbs(data.railS), tol);
  const yAbsMax = (maxDev * 1.25) || 1;

  latestStraightnessChartSvg = buildChartSvg({
    title: "Straightness - Rail (Station-by-Station)",
    subtitleLeft: `Tolerance: ±${tol.toFixed(3)} in  |  Rate limit: ${rateTol.toFixed(3)} in per 20 ft`,
    subtitleRight: `N: ${passNAll ? "PASS" : "FAIL"}  |  S: ${passSAll ? "PASS" : "FAIL"}`,
    stationFt: data.stationFt,
    series: [
      { name: "Rail Center - Column Line N", y: data.railN, style: { stroke: "black", width: 2.5 } },
      { name: "Rail Center - Column Line S", y: data.railS, style: { stroke: "#333", width: 2.5, dash: "6 4" } },
    ],
    yMin: -yAbsMax,
    yMax: yAbsMax,
    tolWindow: { type: "constant", tolIn: tol },
    highlightMax: true,
  });

  setSvgInner(straightnessSvgEl, latestStraightnessChartSvg);

  // Eccentricity (optional)
  if (useBeam) {
    const eccN = data.railN.map((v, i) => v - toNum(data.beamN[i], 0));
    const eccMaxTol = zones ? Math.max(...zones.map(z => z.tolIn)) : 0.75;
    const eccAbs = Math.max(seriesMaxAbs(eccN), eccMaxTol) * 1.25 || 1;

    latestEccentricityChartSvg = buildChartSvg({
      title: "Runway/Rail Eccentricity - Column Line N",
      subtitleLeft: "Eccentricity = RailN − BeamN",
      subtitleRight: zones ? "Zoned tolerance window" : "Constant tolerance window",
      stationFt: data.stationFt,
      series: [
        { name: "Beam/Rail Eccentricity (N)", y: eccN, style: { stroke: "black", width: 2.5 } },
      ],
      yMin: -eccAbs,
      yMax: eccAbs,
      tolWindow: zones ? { type: "zones", zones } : { type: "constant", tolIn: 0.75 },
      highlightMax: true,
    });

    setSvgInner(eccentricitySvgEl, latestEccentricityChartSvg);
  } else {
    latestEccentricityChartSvg = emptySvg("Eccentricity disabled (enable Beam inputs to use).");
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

  // Ensure charts exist (if user evaluated survey)
  const hasSurveyTable = !!(surveyTbody && surveyTbody.querySelector("tr"));
  const includeCharts = hasSurveyTable && (latestStraightnessChartSvg || latestEccentricityChartSvg);

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
          @media print {
            .box { break-inside: avoid; }
            tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>Big G Steel LLC - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${escHtml(projectName)}<br><strong>Generated:</strong> ${escHtml(generatedAt)}</div>

        <div class="box">
          <h2 style="margin:0 0 8px;">Cross-Level Markup Diagram</h2>
          ${latestCrossLevelDiagramSvg}
        </div>

        ${includeCharts ? `
        <div class="box">
          <h2 style="margin:0 0 8px;">Straightness - Rail</h2>
          ${latestStraightnessChartSvg || ""}
        </div>
        <div class="box">
          <h2 style="margin:0 0 8px;">Runway/Rail Eccentricity</h2>
          ${latestEccentricityChartSvg || ""}
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

  summary.textContent = `${passed} of ${rows.length} checks passed for profile: ${profileSelect.value}.`;

  latestCrossLevelDiagramSvg = buildCrossLevelDiagramSvgString();
}

/* ---------------- Init ---------------- */

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

  if (buildSurveyStationsBtn) buildSurveyStationsBtn.addEventListener("click", buildSurveyStations);
  if (evaluateSurveyBtn) evaluateSurveyBtn.addEventListener("click", evaluateAndRenderSurvey);

  // If user changes beam toggle, rebuild stations to show/hide beam columns
  if (surveyUseBeamEl) {
    surveyUseBeamEl.addEventListener("change", () => {
      buildSurveyStations();
    });
  }

  buildProfileOptions();
  profileSelect.value = Object.keys(profiles)[0];
  renderForm();
  buildLayout();

  // Build initial survey table
  buildSurveyStations();
}

window.addEventListener("load", init);
