# About flowsheet inspector extension:


## How to Run Dev
Required packages:
1. Python >= 3.12
1. `pip install idaes-connectivity`
1. `pip install idaes-pse`
1. `idaes get-extensions`
1. `pip install git+https://github.com/prommis/flowsheet-inspector-lib.git` 
---

How to start local dev server:
1. Make sure you are using VS Code as your editor.
1. Clone this repo to local.
1. Make sure you are using nodeJS v24.11.0
1. `npm install` in both `extension` and `webview_ui` folder.
1. Go to `extension` folder, run `npm run watch:build` to enable the live compile feature. (extension live compile)
1. Go to `webview_ui` folder, run `npm run watch:build` to enable the live reload feature. (react live reload)
1. Open `extension/src/extension.ts`, then press `F5` to launch the extension in a new VS Code window. Select the **"Run Extension"** debug configuration.

---

## Dev Server Architecture

- **`extension/`** – Contains the VS Code extension source files.
- **`webview_ui/`** – Contains the webview UI built with React.
- React builds static files that the extension loads into the webview.
- The React dev server allows developers to preview UI changes in the browser without reloading the extension.


# How to install Beta version of extension
## Environment setup
Required packages:
1. Python >= 3.12
1. `pip install idaes-connectivity`
1. `pip install idaes-pse`
1. `idaes get-extensions`
1. `pip install git+https://github.com/prommis/flowsheet-inspector-lib.git` 


## Installation
1. Go to git repo and download the `.vsix` file.
1. Open VS Code, click on four squares extension store icon it will open the extension store panel.
1. On extension store panel top right corner, click on the `"..."` icon then select `Install from VSIX`.
1. From open window (finder or file explorer), select the .vsix file that you downloaded.
1. Now you can see the Prommis icon shows on your VS Code sidebar, click it to open the extension panel.

