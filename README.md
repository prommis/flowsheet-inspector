# Flowsheet Inspector Extension

## Development Setup

### Prerequisites:
1. Python >= 3.12
1. `pip install idaes-connectivity`
1. `pip install idaes-pse`
1. `idaes get-extensions`
1. `pip install git+https://github.com/prommis/flowsheet-inspector-lib.git`

#### **If you are on a Linux machine, please make sure the following packages are installed:
|Package Name|Why|
|--|--|
|libgfortran5|Provides `libgfortran.so.5`, required by IDAES extensions|
|liblapack3|Provides `liblapack.so.3`, required by IDAES extensions|
|libblas3|Required by LAPACK (LAPACK depends on BLAS)|
---

### Starting the Local Dev Server
1. Make sure you are using VS Code as your editor.
1. Clone this repo locally.
1. Make sure you are using Node.js v24.11.0.
1. Run `npm install` in both the `extension` and `webview_ui` folders.
1. In the `extension` folder, run `npm run watch:build` to enable live compilation.
1. In the `webview_ui` folder, run `npm run watch:build` to enable live reload for React.
1. Open `extension/src/extension.ts`, then press `F5` to launch the extension in a new VS Code window. Select the **"Run Extension"** debug configuration.

---

### Dev Server Architecture

- **`extension/`** – Contains the VS Code extension source files.
- **`webview_ui/`** – Contains the webview UI built with React.
  - React builds static files that the extension loads into the webview.
  - The React dev server allows developers to preview UI changes in the browser without reloading the extension.

---

## Installing the Alpha Extension

### Environment Setup
1. Python >= 3.12
1. `pip install idaes-connectivity`
1. `pip install idaes-pse`
1. `idaes get-extensions`
1. `pip install git+https://github.com/prommis/flowsheet-inspector-lib.git`

### Installation
1. Go to the GitHub repo and download the `.vsix` file.
1. Open VS Code and click the Extensions icon (four squares) in the sidebar.
1. In the top-right corner of the Extensions panel, click the **`...`** menu and select **Install from VSIX...**.
1. In the file dialog, select the `.vsix` file you downloaded.
1. The PrOMMiS icon will now appear in your VS Code sidebar. Click it to open the extension panel.

