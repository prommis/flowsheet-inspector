import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { getReactTemplate } from '../util/get_webview_template';
import { registerWebview, unregisterWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import webviewReceiveMessageHandler from '../util/webview_receive_message_handler';

// Store active panel globally so we can reload it
let currentPanel: vscode.WebviewPanel | undefined;
let currentContext: vscode.ExtensionContext | undefined;


/**
 * Webview is the webview tab in vscode editor part, by update param vscode.ViewColumn.One or beside you can config it open a split panel or a new tab panel in vscode editor part.
 * @param context vscode context
 * @param outputFileName TODO: this need to be removed because the run is in the tree view.
 * @returns 
 */
export default async function openWebView(context: vscode.ExtensionContext, outputFileName?: string) {
    // Get the current active editor
    const editor = vscode.window.activeTextEditor;
    let fileName = '';

    if (!editor) {
        // Fallback to activatedFileName from global state if focus is lost (e.g. ran from a webview panel)
        const activatedFileName = context.globalState.get<string>("activatedFileName");
        if (activatedFileName) {
            fileName = activatedFileName;
        } else {
            vscode.window.showErrorMessage('No active editor found and no activated flowsheet found either!');
            console.error('Idaes web view raise an error: fail to find or open the web view.');
            return;
        }
    } else {
        fileName = editor.document.fileName;
    }

    // Create a Webview Panel with split layout (top and bottom sections)
    const webViewPanel = vscode.window.createWebviewPanel(
        'idaes web view',
        `Prommis Flowsheet Inspector - ${fileName.split('/').pop()}`,
        // vscode.ViewColumn.Beside, // Open beside current editor
        vscode.ViewColumn.Beside, // Open beside current editor
        // vscode.ViewColumn.Active,
        {
            enableScripts: true,
            // Enable local resource loading (the React rendered static html css js files)
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))],
            retainContextWhenHidden: true
        }
    );

    webViewPanel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'resources', 'prommis_icon.svg'));

    registerWebview("webView", webViewPanel);

    // Set Webview HTML content - split layout
    webViewPanel.webview.html = getReactTemplate(context, webViewPanel.webview, fileName, '');

    webViewPanel.webview.onDidReceiveMessage(message => {
        if (message.frontendInstruction === 'ready') {
            webViewPanel.webview.postMessage({
                type: "init",
                loadApp: 'webView'
            });
        }
    });

    webViewPanel.onDidDispose(() => {
        unregisterWebview("webView");
    });
}