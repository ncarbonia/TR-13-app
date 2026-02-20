diff --git a/README.md b/README.md
index 64cf21d1ae4d5ff7d6d361c03329cabd0042a458..aa2b10bcd9dce4c0bad8ae8bed80d2e0683fd793 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,44 @@
-# TR-13-app
-Starter repository for Codex testing
+# Big G Steel LLC - TR-13-app
+
+A lightweight mobile-friendly web app for Big G Steel LLC field employees to enter overhead crane installation measurements and quickly check if they are within tolerance.
+
+## What it does
+
+- Captures key installation measurements (overall span and runway straightness).
+- Captures column layout per side (how many columns and direction set as North/South or East/West).
+- Captures user-defined **measured station distance** (feet between measurement stations).
+- Captures both **designed column-to-column distance** and **actual column-to-column distance** for each side segment.
+- Uses the designed distance plus measured station distance to generate station points that start at 0 ft and then increase by the measured station distance (example: 0, 10, 20, 30, 40, 50 for a 60 ft segment with 10 ft spacing).
+- Runs TR-13-oriented elevation checks with separate:
+  - column-to-column distance deviation checks for vertical straightness verification
+  - side elevation measurements from baseline starting at 0 ft and increasing by measured station distance
+  - North-to-South (or East-to-West) span measurement checks at each station, starting at 0 ft and increasing by measured station distance
+- Displays pass/fail by check with references mapped to CMAA No. 70, CMAA No. 74, and TR-13 field checks.
+- Generates engineering adjustment suggestions for any failed/out-of-tolerance checks.
+- Includes an Export to PDF action so the report can be emailed to management.
+- Installable PWA support with offline caching for core app files.
+
+## Run locally
+
+Because this is a static app, any simple web server works:
+
+```bash
+python3 -m http.server 4173
+```
+
+Then open `http://localhost:4173`.
+
+## Notes
+
+Default tolerances are intended as field defaults and should be validated against the latest official CMAA and TR-13 documents and project-specific engineering requirements.
+
+
+## PWA
+
+When opened over HTTP/HTTPS, the app registers a service worker (`sw.js`) and can be installed on supported mobile devices/browsers.
+
+
+## Branding
+
+- Company: Big G Steel LLC
+- Primary app color: `#146bb5` (RGB `20, 107, 181`)
