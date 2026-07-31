# Big G Steel Field Survey App

This folder is a self-contained GitHub Pages app for field-level runway survey capture and customer handoff reporting.

## What It Includes

- Survey job dashboard with create, duplicate, delete, import, and export
- Local autosave in the browser for tablet field use
- Offline-capable PWA files: `manifest.webmanifest`, `service-worker.js`, and `icon.svg`
- Project and system data capture
- Station builder based on runway length, station spacing, and start station
- Tablet-friendly station cards for rail, beam, elevation, span, beam roll, notes, and reviewed status
- TR-13-style review checks for straightness, eccentricity, elevation, rail-to-rail elevation, span, beam roll, and rate of change
- Review charts and out-of-tolerance correction guidance
- Printable customer report view
- JSON job backup export/import and CSV station export

## GitHub Pages Deployment

Replace the current files in your `TR-13-app` repository with these files:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icon.svg`

Commit the changes to `main`. GitHub Pages should update from the same URL you already use:

`https://ncarbonia.github.io/TR-13-app/`

All six files must sit beside each other at the repository root. If `styles.css` is missing or placed inside another folder, the app will show an on-screen deployment warning. After publishing, confirm the page has a dark navy header, orange actions, and a five-step progress rail. If it does not, hard-refresh the page and verify the file locations.

For a quick Windows preview, extract the entire ZIP first and then double-click `index.html` inside the extracted `tr13-field-app` folder. The supplied `index.html` includes the full interface styling and application code, so the local preview does not depend on the browser loading separate CSS or JavaScript files. Keep the other files together for GitHub Pages installation, offline caching, and future editing.

## Field Testing Checklist

1. Open the app on an iPad or tablet.
2. Create a new survey job.
3. Fill in project/system data.
4. Set runway length, station spacing, and tolerances.
5. Build stations.
6. Enter at least five stations of sample data.
7. Close and reopen the browser tab to confirm autosave.
8. Turn on airplane mode and confirm the app still opens after one successful online load.
9. Export the job JSON and CSV.
10. Print the report to PDF and review the customer handoff.

## Important Note

This is a field aid and reporting workflow. Final acceptance criteria, signoff language, and engineering responsibility should still be reviewed against current AIST TR-13, CMAA 70/74, ASTM A6, and project-specific requirements before customer delivery.
