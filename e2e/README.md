# E2E testing: drive a real VS Code webview with Playwright

This folder contains a working harness for testing the extension's webview UI
inside a **real VS Code extension development host** — the same environment a
user sees when pressing F5 — driven headlessly-ish over the Chrome DevTools
Protocol (CDP). It was built while fixing issue #34 (IPOPT layout) and verified
the fix against real report data without any manual clicking.

## Why this approach (hard-won lessons)

- **Plain-browser testing is not enough.** The React bundle can behave
  correctly when served over `http://` into Chromium yet still be reported
  broken in VS Code — you need the real webview host (its injected default
  styles, iframe nesting, and viewport) to trust a layout result.
- **Python Playwright cannot drive Electron.** Electron support only exists in
  the Node.js `playwright`/`playwright-core` packages.
- **`electron.launch()` on the VS Code binary fails** ("Process failed to
  launch!"). The reliable route is: spawn the `code` CLI yourself with
  `--remote-debugging-port=<port>`, then `chromium.connectOverCDP()`.
- **Webview content is a separate CDP target.** The webview's React app does
  NOT appear in the workbench page's frame tree. You must scan *all* browser
  contexts → pages → frames and locate the app by visible text
  (e.g. `FLOWSHEET VARIABLES`).
- **Skip the activity bar.** The extension's icon can be hidden in the
  "Additional Views" overflow (whose menu items are not reachable via DOM).
  Open the results panel through the command palette
  (`Open Flowsheet Inspector`) instead.
- **Inject data instead of running a flowsheet.** Once the panel frame is
  found, `frame.evaluate(window.postMessage({type: 'flowsheet_runner_result',
  data}, '*'))` feeds the React app exactly what the extension broadcasts —
  no Python environment or fi-run needed.
- **Use a throwaway `--user-data-dir`** so the test instance doesn't fight the
  running VS Code, and `pkill -f <profile-dir>` afterwards to clean up.
- Vite builds are ES modules — `file://` loading fails on CORS. If you only
  need a browser-level check, serve `webview_ui/dist` with
  `python3 -m http.server` and stub `acquireVsCodeApi` via an init script.

## Prerequisites

```bash
cd e2e
npm install                    # installs playwright-core (no browser download)
python3 export_sample_report.py   # dumps a real run from ~/.idaes/reportdb.sqlite
```

`export_sample_report.py` needs at least one flowsheet run in the local report
database (run any flowsheet once via the extension).

## Run

```bash
# build the webview first so the extension serves current assets
cd ../webview_ui && npm run build
# compile the extension host code
cd ../extension && npm run compile

cd ../e2e
node drive_vscode.mjs          # launches VS Code, measures, prints JSON, exits
```

The script prints layout measurements as JSON and saves a screenshot to
`e2e/vsc_ipopt.png`. Non-zero exit = failure to reach the expected UI state.

Environment overrides:

- `VSCODE_BIN` — path to the `code` CLI (default: the standard macOS install)
- `CDP_PORT` — remote debugging port (default 9337)

## Adapting for new tests

`drive_vscode.mjs` is deliberately small and linear: launch → connect → open
panel → find frame → inject data → interact → measure. To test a different
view or regression, copy the file and change only the "interact + measure"
section at the bottom; the plumbing above it (launch/connect/frame-finding)
is the reusable part.
