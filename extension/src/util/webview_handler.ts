import * as vscode from 'vscode';
// define a set to store all active webviews
const activateWebviews = new Map<string, vscode.WebviewPanel | vscode.WebviewView>();

// register a webview
export function registerWebview(name: string, webview: vscode.WebviewPanel | vscode.WebviewView) {
    activateWebviews.set(name, webview);
}

// unregister a webview
export function unregisterWebview(name: string) {
    activateWebviews.delete(name);
}

// get a webview by name
export function getWebview(name: string) {
    return activateWebviews.get(name);
}

/**
 * Updates the editor-area results panel's tab title to reflect a flowsheet file.
 *
 * The title is otherwise only set once, from the active editor, when the panel
 * is created — so without this it keeps showing an unrelated file after a
 * historical run is loaded or a different flowsheet is run (issue #9).
 * No-op when the panel is not open or the path is empty.
 *
 * @param filePath Absolute path of the flowsheet file the panel now shows;
 *   only its basename (split on / or \ for Windows paths) appears in the title.
 */
export function setResultsPanelTitle(filePath: string) {
    const panel = activateWebviews.get('webView');
    if (!panel || !filePath) {
        return;
    }
    panel.title = `Flowsheet Inspector - ${filePath.split(/[/\\]/).pop()}`;
}

// brodcast message to all active webviews
export function brodcastMessage(message: any) {
    console.log(`Brodcasting message: ${JSON.stringify(message)} to all active webviews...`);
    if (activateWebviews.size === 0) {
        console.log('No active webviews found! Cannot brodcast message!');
        return;
    }

    activateWebviews.forEach(webview => {
        webview.webview.postMessage(message);
    });

    console.log('Successfully brodcasted message to all active webviews!');
}

export { activateWebviews };
