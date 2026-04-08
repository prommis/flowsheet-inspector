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
