import * as vscode from 'vscode';
import { activateWebviews } from "./webview_handler";
import { IFrontendMessage } from "../interface";
import runFlowsheet from "./run_flowsheet";
import { getWebview, brodcastMessage } from "./webview_handler";

export default function webviewReceiveMessageHandler(context: vscode.ExtensionContext, frontendMessage: IFrontendMessage) {
    console.log(`receive frontend instruction: ${JSON.stringify(frontendMessage)}`);
    if (!frontendMessage.fromPanel || !frontendMessage.frontendInstruction) {
        console.log(`Ignoring message missing fromPanel or frontendInstruction: ${JSON.stringify(frontendMessage)}`);
        return;
    }
    const instruction = frontendMessage.frontendInstruction;
    const fromPanel = frontendMessage.fromPanel;
    const webviewPanel = activateWebviews.get(fromPanel);

    // Error handler if webviewPanel not found log error.
    // Since no webview was found, the error cannot be posted and is logged instead.
    if (!webviewPanel) {
        console.error(`
        webviewReceiveMessageHandler raise error, webviewPanel not frond from activateWebviews.
        It try to find webviewPanel by name: ${fromPanel}.
        `);
        return;
    }

    switch (instruction) {
        case 'ready':
            frontEndReady(context, webviewPanel.webview);
            console.log('frontend ready!');
            break;
        case 'run_flowsheet':
            console.log(`Receive frontend instruction: run flowsheet`);
            console.log(`Start to run flowsheet`);
            let selectedStep = undefined;
            if (frontendMessage.selectedSteps) {
                selectedStep = frontendMessage.selectedSteps;
            }
            runFlowsheet(context, webviewPanel.webview, selectedStep);
            console.log(`Done.`);
            break;
        case 'focus_view':
            console.log(`User is choosing focus view`);
            if (frontendMessage.target) {
                focusView(frontendMessage.target);
            }
            break;
        case 'focus_document':
            console.log(`User selected a document to focus`);
            if (frontendMessage.target) {
                vscode.workspace.openTextDocument(frontendMessage.target).then(
                    doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
                ).then(undefined, err => {
                    console.error(`Failed to show document: ${err}`);
                });
            }
            break;
        case 'switch_sub_tab':
            console.log(`Broadcasting switch_sub_tab to all webviews: ${frontendMessage.tab_name}`);
            brodcastMessage({ type: 'switch_sub_tab', tab_name: frontendMessage.tab_name, sub_tab_name: frontendMessage.sub_tab_name });
            break;
        case 'kill_process':
            if (frontendMessage.pid) {
                console.log(`User requested killing process PID: ${frontendMessage.pid}`);
                try {
                    // Send SIGKILL to the process group
                    process.kill(-Number(frontendMessage.pid), 'SIGKILL');
                } catch (e) {
                    console.error(`Failed to kill process: ${e}`);
                }
            } else {
                console.error('kill_process instruction received but no pid provided.');
            }
            break;
        default:
            console.log(`receive unknown instruction: ${instruction}`);
    }
    return undefined;
}

function frontEndReady(context: vscode.ExtensionContext, webview: vscode.Webview) {
    console.log(`received ready`);
}


function focusView(webViewName: string) {
    let internalName = '';
    let openCommand = '';
    
    if (webViewName === 'webview') {
        internalName = 'webView';
        openCommand = 'idaes-extension.openWebView';
    }

    const webviewPanel = getWebview(internalName);

    if (!webviewPanel) {
        console.log(`webviewPanel ${internalName} not found. Opening it via command ${openCommand}`);
        vscode.commands.executeCommand(openCommand).then(() => {
            // Need to wait for the webview to initialize and React App to load
            setTimeout(() => {
                const refreshedPanel = getWebview(internalName);
                if (refreshedPanel) {
                    refreshedPanel.webview.postMessage({ type: 'highlight_view' });
                }
            }, 1000);
        });
        return;
    }

    // It's open, focus it
    if (internalName === 'webView') {
        (webviewPanel as vscode.WebviewPanel).reveal();
    } else {
        vscode.commands.executeCommand(openCommand);
    }
    
    // Post message to frontend to trigger CSS animation
    webviewPanel.webview.postMessage({ type: 'highlight_view' });
}

