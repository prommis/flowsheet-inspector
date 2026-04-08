import * as vscode from 'vscode';
import * as path from 'path';
import { getReactTemplate } from './get_webview_template';

// Store active panel globally so we can reload it
let currentPanel: vscode.WebviewPanel | undefined;
let currentContext: vscode.ExtensionContext | undefined;

// Export function to reload webview manually (for development)
export function reloadCurrentWebview() {
    if (currentPanel && currentContext) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            currentPanel.webview.html = getReactTemplate(
                currentContext,
                currentPanel.webview,
                editor.document.getText(),
                editor.document.fileName
            );
            console.log('🔄 Webview manually reloaded!');
        }
    } else {
        console.log('⚠️ No active webview to reload');
    }
}
