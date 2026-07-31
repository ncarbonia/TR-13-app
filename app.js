const STORAGE_KEY = "big-g-tr13-survey-jobs-v1";
const ACTIVE_KEY = "big-g-tr13-active-job-v1";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  jobs: [],
  activeId: null,
  currentStationIndex: 0,
  deferredInstallPrompt: null,
  refreshTimer: null
};

const defaults = {
  customer: "",
  projectName: "Runway Survey",
  facilityLocation: "",
  serviceBay: "",
  surveyDate: new Date().toISOString().slice(0, 10),
  surveyors: "",
  reportNumber: "",
  jobNumber: "",
  craneManufacturer: "",
  capacity: "",
  serviceClass: "",
  runwayManufacturer: "",
  railSize: "",
  device: "",
  referenceSpanIn: "",
  runwayLengthFt: "700",
  sideALabel: "Column Line N",
  sideBLabel: "Column Line S",
  startDirection: "WEST",
  endDirection: "EAST",
  stationSpacingFt: "25",
  startStationFt: "0",
  straightnessTolIn: "0.250",
  rateTolPer20Ft: "0.125",
  spanTolIn: "0.250",
  railToRailTolIn: "0.375",
  elevationTolIn: "0.250",
  beamRollTolDeg: "1.100",
  eccentricityZonesText: "0,300,0.630\n300,325,0.454\n325,465,0.765\n465,700,0.630",
  siteNotes: "",
  stations: []
};

function uid() {
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNum(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const raw = String(value).trim();
  const fractionMatch = raw.match(/^(-)?(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const sign = fractionMatch[1] ? -1 : 1;
    const whole = Number(fractionMatch[2] || 0);
    const num = Number(fractionMatch[3]);
    const den = Number(fractionMatch[4]);
    return den ? sign * (whole + num / den) : fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value, digits = 3) {
  const n = toNum(value, NaN);
  return Number.isFinite(n) ? n.toFixed(digits) : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function nearestFraction(value) {
  const abs = Math.abs(toNum(value, 0));
  const table = [
    [0, '0"'], [1 / 16, '1/16"'], [1 / 8, '1/8"'], [3 / 16, '3/16"'],
    [1 / 4, '1/4"'], [5 / 16, '5/16"'], [3 / 8, '3/8"'], [7 / 16, '7/16"'],
    [1 / 2, '1/2"'], [5 / 8, '5/8"'], [3 / 4, '3/4"'], [7 / 8, '7/8"'],
    [1, '1"'], [1.125, '1 1/8"'], [1.25, '1 1/4"'], [1.5, '1 1/2"'], [2, '2"']
  ];
  return table.reduce((best, item) => Math.abs(item[0] - abs) < Math.abs(best[0] - abs) ? item : best)[1];
}

function blankStation(stationFt = 0, index = 0) {
  return {
    id: `station-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    stationFt: Number(stationFt.toFixed(3)),
    columnLabel: "",
    type: index % 2 === 0 ? "Column" : "Midspan",
    railA: "",
    railB: "",
    beamA: "",
    beamB: "",
    elevA: "",
    elevB: "",
    span: "",
    rollA: "",
    rollB: "",
    notes: "",
    reviewed: false
  };
}

function createJob(seed = {}) {
  const cleanSeed = { ...seed };
  delete cleanSeed.id;
  const job = {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...structuredClone(defaults),
    ...cleanSeed
  };
  if (!job.stations?.length) {
    job.stations = buildStationList(job);
  }
  return job;
}

function buildStationList(job) {
  const length = Math.max(0, toNum(job.runwayLengthFt, 0));
  const spacing = Math.max(1, toNum(job.stationSpacingFt, 25));
  const start = toNum(job.startStationFt, 0);
  const stations = [];
  for (let ft = start; ft <= start + length + 0.0001; ft += spacing) {
    stations.push(blankStation(ft, stations.length));
  }
  const lastFt = start + length;
  if (stations.length && Math.abs(stations[stations.length - 1].stationFt - lastFt) > 0.001) {
    stations.push(blankStation(lastFt, stations.length));
  }
  return stations.map((station, index) => ({
    ...station,
    columnLabel: station.columnLabel || suggestedColumnLabel(index)
  }));
}

function suggestedColumnLabel(index) {
  return index % 2 === 0 ? String(index / 2 + 1) : "";
}

function activeJob() {
  return state.jobs.find((job) => job.id === state.activeId) || state.jobs[0];
}

function saveJobs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.jobs));
  localStorage.setItem(ACTIVE_KEY, state.activeId || "");
}

function loadJobs() {
  try {
    state.jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    state.jobs = [];
  }
  if (!state.jobs.length) {
    state.jobs = [createJob({ customer: "Sample Customer", facilityLocation: "Jewett, TX", serviceBay: "Bay 5 Shipping" })];
  }
  state.activeId = localStorage.getItem(ACTIVE_KEY) || state.jobs[0].id;
  if (!activeJob()) state.activeId = state.jobs[0].id;
}

function touchJob(job = activeJob()) {
  if (!job) return;
  job.updatedAt = new Date().toISOString();
  saveJobs();
}

function bindInputs() {
  $$("[data-bind]").forEach((input) => {
    input.addEventListener("input", () => {
      const job = activeJob();
      if (!job) return;
      job[input.dataset.bind] = input.value;
      touchJob(job);
      renderJobSelect();
      renderCompletion();
      renderReview();
    });
  });
}

function hydrateInputs() {
  const job = activeJob();
  $$("[data-bind]").forEach((input) => {
    input.value = job?.[input.dataset.bind] ?? "";
  });
}

function renderJobSelect() {
  const select = $("#jobSelect");
  select.innerHTML = "";
  state.jobs.forEach((job) => {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = jobTitle(job);
    select.appendChild(option);
  });
  select.value = activeJob()?.id || "";
}

function jobTitle(job) {
  const parts = [job.customer, job.serviceBay || job.projectName, job.surveyDate].filter(Boolean);
  return parts.join(" - ") || "Untitled Survey";
}

function parseZones(text) {
  const zones = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [start, end, tol] = line.split(",").map((part) => toNum(part.trim(), NaN));
      return { start, end, tol };
    })
    .filter((zone) => [zone.start, zone.end, zone.tol].every(Number.isFinite));
  return zones.length ? zones : [{ start: -Infinity, end: Infinity, tol: toNum(activeJob()?.straightnessTolIn, 0.25) }];
}

function eccentricityTolAt(job, stationFt) {
  const zones = parseZones(job.eccentricityZonesText);
  const zone = zones.find((item) => stationFt >= item.start && stationFt <= item.end);
  return zone ? zone.tol : zones[zones.length - 1].tol;
}

function stationEval(job, station, previous) {
  const straightTol = Math.abs(toNum(job.straightnessTolIn, 0.25));
  const rateTol = Math.abs(toNum(job.rateTolPer20Ft, 0.125));
  const spanTol = Math.abs(toNum(job.spanTolIn, 0.25));
  const rrTol = Math.abs(toNum(job.railToRailTolIn, 0.375));
  const elevTol = Math.abs(toNum(job.elevationTolIn, 0.25));
  const rollTol = Math.abs(toNum(job.beamRollTolDeg, 1.1));
  const referenceSpan = toNum(job.referenceSpanIn, NaN);
  const eccTol = Math.abs(eccentricityTolAt(job, station.stationFt));
  const railA = toNum(station.railA, NaN);
  const railB = toNum(station.railB, NaN);
  const beamA = toNum(station.beamA, NaN);
  const beamB = toNum(station.beamB, NaN);
  const elevA = toNum(station.elevA, NaN);
  const elevB = toNum(station.elevB, NaN);
  const span = toNum(station.span, NaN);
  const rollA = toNum(station.rollA, NaN);
  const rollB = toNum(station.rollB, NaN);
  const checks = [];

  addCheck(checks, "Straightness A", station, railA, straightTol, "Rail A horizontal offset", correctionAxis(railA, straightTol, "Rail A"));
  addCheck(checks, "Straightness B", station, railB, straightTol, "Rail B horizontal offset", correctionAxis(railB, straightTol, "Rail B"));
  if (Number.isFinite(beamA) && Number.isFinite(railA)) {
    addCheck(checks, "Eccentricity A", station, railA - beamA, eccTol, "Rail A vs beam A centerline", correctionAxis(railA - beamA, eccTol, "Rail A"));
  }
  if (Number.isFinite(beamB) && Number.isFinite(railB)) {
    addCheck(checks, "Eccentricity B", station, railB - beamB, eccTol, "Rail B vs beam B centerline", correctionAxis(railB - beamB, eccTol, "Rail B"));
  }
  addCheck(checks, "Elevation A", station, elevA, elevTol, "Top of rail A elevation from baseline", correctionVertical(elevA, elevTol, job.sideALabel));
  addCheck(checks, "Elevation B", station, elevB, elevTol, "Top of rail B elevation from baseline", correctionVertical(elevB, elevTol, job.sideBLabel));
  if (Number.isFinite(elevA) && Number.isFinite(elevB)) {
    addCheck(checks, "Rail-to-Rail Elevation", station, elevA - elevB, rrTol, "Cross-level A minus B", correctionCrossLevel(elevA - elevB, rrTol, job.sideALabel, job.sideBLabel));
  }
  if (Number.isFinite(span) && Number.isFinite(referenceSpan)) {
    const delta = span - referenceSpan;
    addCheck(checks, "Runway Span", station, delta, spanTol, "Measured span vs reference span", correctionSpan(delta, spanTol));
  }
  addCheck(checks, "Beam Roll A", station, rollA, rollTol, "Beam A rotation", correctionRoll(rollA, rollTol, job.sideALabel));
  addCheck(checks, "Beam Roll B", station, rollB, rollTol, "Beam B rotation", correctionRoll(rollB, rollTol, job.sideBLabel));

  if (previous) {
    const distance = Math.abs(station.stationFt - previous.stationFt);
    const scale = distance > 0 ? 20 / distance : 1;
    const prevA = toNum(previous.railA, NaN);
    const prevB = toNum(previous.railB, NaN);
    if (Number.isFinite(prevA) && Number.isFinite(railA)) {
      addCheck(checks, "Rate of Change A", station, (railA - prevA) * scale, rateTol, "Rail A change normalized to 20 ft", "Review alignment trend and re-shoot adjacent stations.");
    }
    if (Number.isFinite(prevB) && Number.isFinite(railB)) {
      addCheck(checks, "Rate of Change B", station, (railB - prevB) * scale, rateTol, "Rail B change normalized to 20 ft", "Review alignment trend and re-shoot adjacent stations.");
    }
  }

  const failures = checks.filter((check) => check.status === "fail");
  return { checks, failures, pass: failures.length === 0 };
}

function addCheck(checks, name, station, measured, allowed, reference, correction) {
  if (!Number.isFinite(measured)) return;
  checks.push({
    name,
    stationId: station.id,
    stationFt: station.stationFt,
    measured,
    allowed,
    reference,
    correction,
    status: Math.abs(measured) <= Math.abs(allowed) ? "pass" : "fail"
  });
}

function correctionAxis(value, tol, label) {
  const excess = Math.max(0, Math.abs(value) - Math.abs(tol));
  if (!excess) return "Within tolerance.";
  const direction = value > 0 ? "move inward/negative" : "move outward/positive";
  return `${label}: ${direction} about ${nearestFraction(excess)} (${fmt(excess)} in), then remeasure.`;
}

function correctionVertical(value, tol, label) {
  const excess = Math.max(0, Math.abs(value) - Math.abs(tol));
  if (!excess) return "Within tolerance.";
  return `${value > 0 ? "Lower" : "Raise"} ${label} about ${nearestFraction(excess)} (${fmt(excess)} in).`;
}

function correctionCrossLevel(value, tol, sideA, sideB) {
  const excess = Math.max(0, Math.abs(value) - Math.abs(tol));
  if (!excess) return "Within tolerance.";
  return value > 0
    ? `Lower ${sideA} or raise ${sideB} about ${nearestFraction(excess)} (${fmt(excess)} in).`
    : `Lower ${sideB} or raise ${sideA} about ${nearestFraction(excess)} (${fmt(excess)} in).`;
}

function correctionSpan(delta, tol) {
  const excess = Math.max(0, Math.abs(delta) - Math.abs(tol));
  if (!excess) return "Within tolerance.";
  return delta > 0
    ? `Span is wide. Move rails in about ${nearestFraction(excess)} (${fmt(excess)} in total).`
    : `Span is narrow. Move rails out about ${nearestFraction(excess)} (${fmt(excess)} in total).`;
}

function correctionRoll(value, tol, label) {
  const excess = Math.max(0, Math.abs(value) - Math.abs(tol));
  if (!excess) return "Within tolerance.";
  return `${label}: beam roll exceeds tolerance by ${fmt(excess, 2)} degrees. Review bearing/shim condition.`;
}

function evaluateJob(job = activeJob()) {
  const sorted = [...(job?.stations || [])].sort((a, b) => toNum(a.stationFt) - toNum(b.stationFt));
  const stationResults = sorted.map((station, index) => ({
    station,
    ...stationEval(job, station, sorted[index - 1])
  }));
  const checks = stationResults.flatMap((result) => result.checks);
  const failures = checks.filter((check) => check.status === "fail");
  return { stationResults, checks, failures };
}

function renderCompletion() {
  const job = activeJob();
  const results = evaluateJob(job);
  const required = [
    ["Project setup", job.customer && job.facilityLocation && job.serviceBay],
    ["System data", job.referenceSpanIn && job.runwayLengthFt],
    ["Stations built", job.stations.length > 1],
    ["Measurements entered", job.stations.some((station) => station.railA || station.railB || station.elevA || station.elevB || station.span)],
    ["Reviewed stations", job.stations.length && job.stations.every((station) => station.reviewed)],
    ["Compliance generated", results.checks.length > 0]
  ];
  $("#completionList").innerHTML = `<div class="status-list">${required.map(([label, ok]) => `
    <div class="status-item">
      <span>${escapeHtml(label)}</span>
      <span class="status-pill ${ok ? "ok" : "warn"}">${ok ? "Ready" : "Open"}</span>
    </div>`).join("")}</div>`;
}

function renderLayoutTable() {
  const job = activeJob();
  $("#layoutTable").innerHTML = job.stations.map((station, index) => `
    <tr>
      <td><input data-station-field="stationFt" data-station-index="${index}" value="${escapeHtml(station.stationFt)}" inputmode="decimal" /></td>
      <td><input data-station-field="columnLabel" data-station-index="${index}" value="${escapeHtml(station.columnLabel)}" /></td>
      <td>
        <select data-station-field="type" data-station-index="${index}">
          <option ${station.type === "Column" ? "selected" : ""}>Column</option>
          <option ${station.type === "Midspan" ? "selected" : ""}>Midspan</option>
          <option ${station.type === "Control" ? "selected" : ""}>Control</option>
        </select>
      </td>
      <td><button class="danger" type="button" data-delete-station="${index}">Delete</button></td>
    </tr>
  `).join("");
}

function renderStationCards() {
  const job = activeJob();
  const search = $("#stationSearch").value.trim().toLowerCase();
  const template = $("#stationCardTemplate");
  const cards = $("#stationCards");
  cards.innerHTML = "";
  job.stations.forEach((station, index) => {
    const haystack = `${station.stationFt} ${station.columnLabel} ${station.type}`.toLowerCase();
    if (search && !haystack.includes(search)) return;
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.stationIndex = index;
    if (index === state.currentStationIndex) node.classList.add("focused");
    $(".station-type", node).textContent = station.type || "Station";
    $(".station-title", node).textContent = `${fmt(station.stationFt, 1)} ft${station.columnLabel ? ` - ${station.columnLabel}` : ""}`;
    $(".reviewed-input", node).checked = Boolean(station.reviewed);
    ["railA", "railB", "beamA", "beamB", "elevA", "elevB", "span", "rollA", "rollB", "notes"].forEach((field) => {
      $(`.${field}`, node).value = station[field] ?? "";
      $(`.${field}`, node).dataset.field = field;
    });
    const result = stationEval(job, station, job.stations[index - 1]);
    $(".station-results", node).innerHTML = result.checks.length
      ? result.checks.slice(0, 8).map((check) => `<span class="result-pill ${check.status}">${escapeHtml(check.name)}: ${check.status.toUpperCase()}</span>`).join("")
      : `<span class="result-pill pass">No measurements yet</span>`;
    cards.appendChild(node);
  });
}

function renderReview() {
  const job = activeJob();
  const results = evaluateJob(job);
  const stationCount = job.stations.length;
  const reviewed = job.stations.filter((station) => station.reviewed).length;
  const maxDeviation = results.failures.reduce((max, check) => Math.max(max, Math.abs(check.measured)), 0);
  $("#summaryMetrics").innerHTML = [
    ["Stations", stationCount],
    ["Reviewed", `${reviewed}/${stationCount}`],
    ["Failed Checks", results.failures.length],
    ["Max Failed Deviation", `${fmt(maxDeviation)} in/deg`]
  ].map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  $("#failureTable").innerHTML = results.failures.length
    ? results.failures.map((check) => `
      <tr>
        <td>${escapeHtml(check.name)}<br><small>${escapeHtml(check.reference)}</small></td>
        <td>${fmt(check.stationFt, 1)} ft</td>
        <td>${fmt(check.measured)}</td>
        <td>±${fmt(check.allowed)}</td>
        <td>${escapeHtml(check.correction)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No out-of-tolerance items found from entered measurements.</td></tr>`;

  $("#charts").innerHTML = [
    chartPanel("Rail Straightness", lineChart(job, "railA", "railB", toNum(job.straightnessTolIn, 0.25), "in")),
    chartPanel("Elevation", lineChart(job, "elevA", "elevB", toNum(job.elevationTolIn, 0.25), "in")),
    chartPanel("Span Deviation", spanChart(job))
  ].join("");
}

function chartPanel(title, svg) {
  return `<section class="chart-panel"><h3>${escapeHtml(title)}</h3>${svg}</section>`;
}

function lineChart(job, fieldA, fieldB, tol, unit) {
  const points = job.stations.map((station) => ({
    x: toNum(station.stationFt, 0),
    a: toNum(station[fieldA], NaN),
    b: toNum(station[fieldB], NaN)
  }));
  return makeSvg(points, [
    { key: "a", label: job.sideALabel || "Line A", color: "#17624f" },
    { key: "b", label: job.sideBLabel || "Line B", color: "#b3261e" }
  ], tol, unit);
}

function spanChart(job) {
  const reference = toNum(job.referenceSpanIn, NaN);
  const points = job.stations.map((station) => ({
    x: toNum(station.stationFt, 0),
    a: Number.isFinite(reference) ? toNum(station.span, NaN) - reference : NaN
  }));
  return makeSvg(points, [{ key: "a", label: "Span deviation", color: "#17624f" }], toNum(job.spanTolIn, 0.25), "in");
}

function makeSvg(points, series, tol, unit) {
  const valid = points.filter((point) => series.some((item) => Number.isFinite(point[item.key])));
  if (valid.length < 2) return `<p>No chart data yet.</p>`;
  const width = 920;
  const height = 310;
  const margin = { left: 54, right: 24, top: 18, bottom: 42 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const minX = Math.min(...valid.map((point) => point.x));
  const maxX = Math.max(...valid.map((point) => point.x));
  const allY = valid.flatMap((point) => series.map((item) => point[item.key]).filter(Number.isFinite));
  const maxAbsY = Math.max(Math.abs(tol), ...allY.map(Math.abs), 0.25);
  const yMax = Math.ceil((maxAbsY * 1.18) / 0.1) * 0.1;
  const x = (value) => margin.left + ((value - minX) / Math.max(1, maxX - minX)) * plotW;
  const y = (value) => margin.top + (1 - (value + yMax) / (2 * yMax)) * plotH;
  const path = (key) => valid
    .filter((point) => Number.isFinite(point[key]))
    .map((point, index) => `${index ? "L" : "M"} ${x(point.x).toFixed(1)} ${y(point[key]).toFixed(1)}`)
    .join(" ");
  const grid = [-tol, 0, tol].map((value) => `<line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" stroke="${value ? "#d99a91" : "#aab8b3"}" stroke-dasharray="${value ? "5 5" : ""}"/><text x="8" y="${y(value) + 4}" font-size="12">${value.toFixed(2)} ${unit}</text>`).join("");
  const stationTicks = valid.filter((_, index) => index === 0 || index === valid.length - 1 || index % Math.ceil(valid.length / 8) === 0)
    .map((point) => `<line x1="${x(point.x)}" y1="${margin.top}" x2="${x(point.x)}" y2="${height - margin.bottom}" stroke="#edf1ef"/><text x="${x(point.x)}" y="${height - 14}" text-anchor="middle" font-size="12">${point.x.toFixed(0)}'</text>`)
    .join("");
  const lines = series.map((item) => `<path d="${path(item.key)}" fill="none" stroke="${item.color}" stroke-width="3"/><text x="${width - margin.right - 150}" y="${margin.top + 18 + series.indexOf(item) * 18}" fill="${item.color}" font-size="13">${escapeHtml(item.label)}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Survey chart">
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${stationTicks}
    ${grid}
    ${lines}
    <rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#d8e0dc"/>
  </svg>`;
}

function renderReport() {
  const job = activeJob();
  const results = evaluateJob(job);
  const grouped = groupFailures(results.failures);
  $("#reportPreview").innerHTML = `
    <header>
      <p class="eyebrow">Runway Survey</p>
      <h2>${escapeHtml(job.customer || "Customer")} - ${escapeHtml(job.facilityLocation || "Facility")}</h2>
      <p><strong>${escapeHtml(job.serviceBay || job.projectName || "Survey")}</strong> ${job.capacity ? `- ${escapeHtml(job.capacity)}` : ""}</p>
    </header>

    <section>
      <h3>Project Data</h3>
      <div class="report-grid">
        ${reportField("Survey Date", job.surveyDate)}
        ${reportField("Surveyors", job.surveyors)}
        ${reportField("Report Number", job.reportNumber)}
        ${reportField("Job Number", job.jobNumber)}
        ${reportField("Crane Manufacturer", job.craneManufacturer)}
        ${reportField("Runway Manufacturer", job.runwayManufacturer)}
        ${reportField("Rail Size", job.railSize)}
        ${reportField("Device / Method", job.device)}
        ${reportField("Reference Span", job.referenceSpanIn ? `${fmt(job.referenceSpanIn)} in` : "")}
        ${reportField("Runway Length", job.runwayLengthFt ? `${fmt(job.runwayLengthFt, 1)} ft` : "")}
      </div>
    </section>

    <section>
      <h3>Summary</h3>
      <div class="report-grid">
        ${reportField("Stations Captured", job.stations.length)}
        ${reportField("Reviewed Stations", `${job.stations.filter((station) => station.reviewed).length}/${job.stations.length}`)}
        ${reportField("Total Checks", results.checks.length)}
        ${reportField("Out-of-Tolerance Checks", results.failures.length)}
      </div>
    </section>

    <section>
      <h3>Out-of-Tolerance Summary</h3>
      ${Object.keys(grouped).length ? `<ul>${Object.entries(grouped).map(([name, items]) => `<li><strong>${escapeHtml(name)}:</strong> ${items.length} item(s), max deviation ${fmt(Math.max(...items.map((item) => Math.abs(item.measured))))}</li>`).join("")}</ul>` : "<p>No out-of-tolerance items found from entered measurements.</p>"}
    </section>

    <section>
      <h3>Recommended Field Action</h3>
      <p>${results.failures.length ? "Correct all tolerance violations, remeasure affected stations and adjacent stations, then refresh the report before customer handoff." : "Entered measurements currently show no tolerance violations. Complete final engineering review before signoff."}</p>
    </section>

    <section>
      <h3>Site Notes</h3>
      <p>${escapeHtml(job.siteNotes || "No site notes entered.")}</p>
    </section>
  `;
}

function reportField(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not entered")}</strong></div>`;
}

function groupFailures(failures) {
  return failures.reduce((acc, item) => {
    acc[item.name] = acc[item.name] || [];
    acc[item.name].push(item);
    return acc;
  }, {});
}

function renderAll() {
  hydrateInputs();
  renderJobSelect();
  renderLayoutTable();
  renderStationCards();
  renderCompletion();
  renderReview();
  renderReport();
}

function updateStation(index, field, value, options = {}) {
  const job = activeJob();
  if (!job?.stations[index]) return;
  job.stations[index][field] = value;
  touchJob(job);
  if (options.render === "quiet") return;
  if (options.render === "card") {
    renderCompletion();
    renderReview();
    renderReport();
    return;
  }
  renderAll();
}

function updateVisibleCardResults(card, index) {
  const job = activeJob();
  const station = job?.stations[index];
  if (!station) return;
  const result = stationEval(job, station, job.stations[index - 1]);
  $(".station-results", card).innerHTML = result.checks.length
    ? result.checks.slice(0, 8).map((check) => `<span class="result-pill ${check.status}">${escapeHtml(check.name)}: ${check.status.toUpperCase()}</span>`).join("")
    : `<span class="result-pill pass">No measurements yet</span>`;
}

function scheduleReviewRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    renderReview();
    renderReport();
  }, 220);
}

function downloadFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportActiveJob() {
  const job = activeJob();
  const safeName = (jobTitle(job) || "survey-job").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  downloadFile(`${safeName}.json`, "application/json", JSON.stringify(job, null, 2));
}

function downloadCsv() {
  const job = activeJob();
  const header = ["stationFt", "columnLabel", "type", "railA", "railB", "beamA", "beamB", "elevA", "elevB", "span", "rollA", "rollB", "reviewed", "notes"];
  const rows = job.stations.map((station) => header.map((key) => `"${String(station[key] ?? "").replace(/"/g, '""')}"`).join(","));
  downloadFile("survey-stations.csv", "text/csv", `${header.join(",")}\n${rows.join("\n")}`);
}

function copySummary() {
  const job = activeJob();
  const results = evaluateJob(job);
  const text = `${jobTitle(job)}\nStations: ${job.stations.length}\nReviewed: ${job.stations.filter((station) => station.reviewed).length}/${job.stations.length}\nOut-of-tolerance checks: ${results.failures.length}`;
  navigator.clipboard?.writeText(text);
}

function setTab(id) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  $$(".tab-page").forEach((page) => page.classList.toggle("active", page.id === id));
  if (id === "report") renderReport();
}

function attachEvents() {
  bindInputs();

  $("#jobSelect").addEventListener("change", (event) => {
    state.activeId = event.target.value;
    state.currentStationIndex = 0;
    saveJobs();
    renderAll();
  });

  $("#newJobButton").addEventListener("click", () => {
    const job = createJob();
    state.jobs.unshift(job);
    state.activeId = job.id;
    state.currentStationIndex = 0;
    saveJobs();
    renderAll();
  });

  $("#duplicateJobButton").addEventListener("click", () => {
    const original = activeJob();
    const copy = createJob({ ...structuredClone(original), projectName: `${original.projectName || "Survey"} Copy` });
    state.jobs.unshift(copy);
    state.activeId = copy.id;
    saveJobs();
    renderAll();
  });

  $("#deleteJobButton").addEventListener("click", () => {
    if (state.jobs.length <= 1) return alert("Keep at least one survey job.");
    if (!confirm("Delete this survey job from this device?")) return;
    state.jobs = state.jobs.filter((job) => job.id !== state.activeId);
    state.activeId = state.jobs[0].id;
    saveJobs();
    renderAll();
  });

  $("#exportJobButton").addEventListener("click", exportActiveJob);
  $("#downloadCsvButton").addEventListener("click", downloadCsv);
  $("#copyReportButton").addEventListener("click", copySummary);
  $("#refreshReportButton").addEventListener("click", renderReport);
  $("#printReportButton").addEventListener("click", () => {
    renderReport();
    setTab("report");
    window.print();
  });

  $("#importJobInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const job = createJob({ ...imported, id: uid(), createdAt: new Date().toISOString() });
      state.jobs.unshift(job);
      state.activeId = job.id;
      saveJobs();
      renderAll();
    } catch {
      alert("That file could not be imported. Use a JSON export from this app.");
    } finally {
      event.target.value = "";
    }
  });

  $("#buildStationsButton").addEventListener("click", () => {
    const job = activeJob();
    if (!confirm("Rebuild stations from runway length and spacing? Existing station measurements will be replaced.")) return;
    job.stations = buildStationList(job);
    state.currentStationIndex = 0;
    touchJob(job);
    renderAll();
  });

  $("#addStationButton").addEventListener("click", () => {
    const job = activeJob();
    const last = job.stations[job.stations.length - 1];
    const nextFt = toNum(last?.stationFt, 0) + toNum(job.stationSpacingFt, 25);
    job.stations.push(blankStation(nextFt, job.stations.length));
    touchJob(job);
    renderAll();
  });

  $("#layoutTable").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.stationIndex);
    const field = event.target.dataset.stationField;
    if (field) updateStation(index, field, event.target.value);
  });

  $("#layoutTable").addEventListener("click", (event) => {
    const index = event.target.dataset.deleteStation;
    if (index === undefined) return;
    const job = activeJob();
    job.stations.splice(Number(index), 1);
    touchJob(job);
    renderAll();
  });

  $("#stationCards").addEventListener("input", (event) => {
    const card = event.target.closest(".station-card");
    if (!card) return;
    const index = Number(card.dataset.stationIndex);
    if (event.target.classList.contains("reviewed-input")) {
      updateStation(index, "reviewed", event.target.checked, { render: "card" });
      return;
    }
    const field = event.target.dataset.field;
    if (field) {
      updateStation(index, field, event.target.value, { render: "quiet" });
      updateVisibleCardResults(card, index);
      renderCompletion();
      scheduleReviewRefresh();
    }
  });

  $("#stationSearch").addEventListener("input", renderStationCards);

  $("#previousStationButton").addEventListener("click", () => focusStation(state.currentStationIndex - 1));
  $("#nextStationButton").addEventListener("click", () => focusStation(state.currentStationIndex + 1));
  $("#markReviewedButton").addEventListener("click", () => {
    const job = activeJob();
    if (!job.stations[state.currentStationIndex]) return;
    job.stations[state.currentStationIndex].reviewed = true;
    touchJob(job);
    renderAll();
    focusStation(Math.min(state.currentStationIndex + 1, job.stations.length - 1));
  });

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    $("#installButton").hidden = false;
  });

  $("#installButton").addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $("#installButton").hidden = true;
  });
}

function focusStation(index) {
  const job = activeJob();
  state.currentStationIndex = Math.max(0, Math.min(index, job.stations.length - 1));
  renderStationCards();
  const card = $(`.station-card[data-station-index="${state.currentStationIndex}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function init() {
  loadJobs();
  attachEvents();
  renderAll();
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch {
      console.warn("Service worker registration failed.");
    }
  }
}

init();
