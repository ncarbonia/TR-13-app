# Big G Steel - TR-13-app

A lightweight mobile-friendly web app for Big G Steel field employees to enter overhead crane installation measurements and quickly check if they are within tolerance.

## What it does

- Captures key installation measurements.
- Captures column layout per side.
- Captures user-defined measured station distance.
- Captures actual column-to-column distance for each side segment.
- Captures side elevation from baseline at station points.
- Auto-calculates Rail to Rail measurements from the two rail elevations entered at the same station.
- Captures span measurements at each station and compares them to a single reference span.
- Runs TR-13-oriented field checks with pass/fail output.
- Generates engineering adjustment suggestions for failed checks.
- Includes export to PDF.
- Includes installable PWA support with offline caching for core app files.

## Run locally

Because this is a static app, any simple web server works:

```bash
python3 -m http.server 4173
