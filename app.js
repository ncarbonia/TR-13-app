/* app.js — Big G Steel LLC TR-13 / CMAA field check */

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

/* ---------- DOM lookups (guarded) ---------- */

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

let latestRows = [];

// If any of these are missing, the app can’t function correctly.
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

/* ---------- Profiles / base form ---------- */

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

/* ---------- Layout generation ---------- */

function stationOffsets(designDistanceFt, stationDistanceFt) {
  const offsets = [];
  for (let offset = 0; offset < designDistanceFt; offset += stationDistanceFt) {
    offsets.push(offset);
  }
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
    "<legend>Side elevation measurements from Baseline (start at 0 ft, then measured station distance)</legend>";

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

  // Cross-level (span) measurements between sides
  const crossLevelMeasurements = document.createElement("fieldset");
  crossLevelMeasurements.className = "grid";
  crossLevelMeasurements.innerHTML = `<legend>${sides[0].label} to ${sides[1].label} span measurements (start at 0 ft, then measured station distance)</legend>`;

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
        label.innerHTML = `${sides[0].label}${segment} to ${sides[1].label}${segment} span measurement at ${offset} ft station (in)
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
      North-to-South / East-to-West span tolerance (in)
      <input type="number" step="any" min="0" id="crossLevelTol" value="0.375" />
    </label>`;
  layoutContainer.append(tolerances);

  summary.textContent =
    "Layout built. Enter distances and elevations, then run the compliance check.";
}

/* ---------- Core evaluation ---------- */

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
        reference: "TR-13 column line distance / vertical straightness verification",
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
          reference: "TR-13 baseline elevation check",
        });
      });
    }
  });

  // Cross-level checks
  for (let segment = 1; segment < columns; segment += 1) {
    const sideADesignDistance = Number(document.getElementById(`sideA_design_distance_${segment}`)?.value ?? 0);
    const sideBDesignDistance = Number(document.getElementById(`sideB_design_distance_${segment}`)?.value ?? 0);

    const offsets = stationOffsets(Math.min(sideADesignDistance, sideBDesignDistance), measuredStationDistance);

    offsets.forEach((offset) => {
      const crossLevelValue = Math.abs(
        Number(document.getElementById(`cross_segment_${segment}_station_${offset}`)?.value ?? 0)
      );

      rows.push({
        check: `${sides[0].label}${segment} to ${sides[1].label}${segment} span at ${offset} ft station`,
        measuredText: `${crossLevelValue.toFixed(3)} in span measurement`,
        allowedText: `≤ ${crossLevelTol.toFixed(3)} in`,
        pass: crossLevelValue <= crossLevelTol,
        reference: "TR-13 cross-level tolerance",
      });
    });
  }

  return rows;
}

/* ---------- Suggestions (safe if panel missing) ---------- */

function suggestionForRow(row) {
  const check = row.check.toLowerCase();

  if (check.includes("distance check")) {
    return "Verify column plumbness and anchor position; shim base plates or re-align support steel before final tightening.";
  }
  if (check.includes("baseline check")) {
    return "Adjust rail seat elevation with shim packs/grout and re-shoot baseline elevations at the affected stations.";
  }
  if (check.includes("span at")) {
    return "Correct cross-level by balancing opposite-side elevation points and confirm with repeat station measurements from the same datum.";
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
  // If suggestions UI isn’t present, do nothing (don’t crash).
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

/* ---------- PDF export ---------- */

function exportPdfReport() {
  if (!latestRows.length) {
    summary.textContent = "Run a compliance check first, then export to PDF.";
    return;
  }

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
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; font-size: 12px; }
          h1 { margin: 0 0 6px; }
          .meta { color: #444; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <h1>Big G Steel LLC - TR-13 Compliance Report</h1>
        <div class="meta"><strong>Project:</strong> ${projectName}<br><strong>Generated:</strong> ${generatedAt}</div>
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

/* ---------- Run compliance ---------- */

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

/* ---------- Event wiring + init ---------- */

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

  buildProfileOptions();
  profileSelect.value = Object.keys(profiles)[0];
  renderForm();
  buildLayout();
}

window.addEventListener("load", init);
