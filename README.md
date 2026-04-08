# nodeJS version: 24.11.0
# require idaes-pse with structure_flowsheet branch (idaes-run command must available)
# require idaes, idaes extensions

## How to Run Dev

1. Run `npm run watch` in the `extension` folder. This enables the TypeScript compiler to watch for file changes and compile them to JavaScript in the `out` folder.
2. Navigate to the `webview_ui` folder and run `npm run dev` to start the React dev server. You can preview UI changes in your browser.
3. Navigate to the `webview_ui` folder and run `npm run watch:build` to enable watch mode. This automatically builds the React code for the extension to use.
4. Open `extension/src/extension.ts`, then press `F5` to launch the extension in a new VS Code window. Select the **"Run Extension"** debug configuration.

## Dev Server Architecture

- **`extension/`** – Contains the VS Code extension source files.
- **`webview_ui/`** – Contains the webview UI built with React.
- React builds static files that the extension loads into the webview.
- The React dev server allows developers to preview UI changes in the browser without reloading the extension.