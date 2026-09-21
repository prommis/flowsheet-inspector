# Flowsheet Inspector Extension

## Development Setup

### Prerequisites

1. NodeJS >= 24.11.0
1. Python >= 3.12

### Installation
1. Create a conda environment with Python >= 3.12
1. Activate the newly created env
1. Run: `pip install git+https://github.com/prommis/flowsheet-inspector-lib.git`
1. Run: `idaes get-extensions`
1. Change to the `extension` folder and run: `npm install`
1. Change to the `webview_ui` folder and run: `npm install`


### Running the dev environment
1. Make sure you are using VS Code as your editor and Node.js >= 24.11.0.
1. Change to the `extension` folder and run: `npm run watch:build` to enable live compilation
1. Change to the `webview_ui` folder and run: `npm run watch:build` to rebuild the React UI on every change
1. Open the project in VS Code and open `/extension/src/extension.ts`
1. Press `F5` and select the **"Run Extension"** debug configuration. This compiles the extension and launches it in a new VS Code window.
1. In the new window, open the Flowsheet Inspector sidebar and use the Python interpreter selector to pick the conda env you created above. You do not need to activate the env in a terminal.
1. After changing code, reload the webview in the debug window with `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

### Releasing and building a package
1. Update the package version number in `package.json` and record your changes in `/extension/CHANGELOG.md`
```JSON
How to update the version number in package.json:
{
    "name": "flowsheet-inspector",
    "publisher": "idaes-team",
    "displayName": "Flowsheet-inspector",
    "description": "",
    "version": "0.0.15", <- HERE
    ...
}
```
2. Commit your changes, create a PR against the main branch, and merge it.
1. From the main branch, create a new release branch named with the version number, for example: `release-0.0.3`
1. On the new branch, change to the `/extension/` folder and run `npm run package`
1. After the command finishes, you will find the new package in the project root folder, named with the version number you set.

#### Linux: Additional Required Packages

If you are on a Linux machine, please make sure the following packages are installed:

| Package Name | Why |
|---|---|
| libgfortran5 | Provides `libgfortran.so.5`, required by IDAES extensions |
| liblapack3   | Provides `liblapack.so.3`, required by IDAES extensions |
| libblas3     | Required by LAPACK (LAPACK depends on BLAS) |

---

### Database Issues

If there is a schema update in [flowsheet-inspector-lib](https://github.com/prommis/flowsheet-inspector-lib), you must delete the old `reportdb.sqlite` file in your dev environment to avoid errors.

The database file is located at:

| OS      | Path |
|---------|------|
| macOS   | `~/.idaes/reportdb.sqlite` |
| Linux   | `~/.idaes/reportdb.sqlite` |
| Windows | `%LOCALAPPDATA%\idaes\reportdb.sqlite` (e.g. `C:\Users\YourUserName\AppData\Local\idaes\reportdb.sqlite`) |

---

### Dev Server Architecture

- **`extension/`** – Contains the VS Code extension source files.
- **`webview_ui/`** – Contains the webview UI built with React.
  - React builds static files into `webview_ui/dist/`, and the Vite config copies them to `extension/src/webview_template/webview_new/`, which is what the extension loads into the webview.
  - The UI cannot be previewed in a plain browser with `npm run dev`. It calls the VS Code webview API on load and needs the extension host to send its init message, so always test it inside the debug VS Code window.

