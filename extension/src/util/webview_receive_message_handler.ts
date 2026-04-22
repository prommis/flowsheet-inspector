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
        case 'pull_flowsheet_history':
            if (frontendMessage.id || frontendMessage.name) {
                console.log(`Loading historical run for: ${frontendMessage.id ? 'ID ' + frontendMessage.id : frontendMessage.name}`);

                // Check if webView is open. If not, open it before grabbing results!
                if (!activateWebviews.get('webView')) {
                    console.log('Main web view not found. Opening it via command flowsheet-inspector.openWebView');
                    vscode.commands.executeCommand('flowsheet-inspector.openWebView').then(() => {
                        // Wait for React to mount before continuing
                        setTimeout(() => {
                            webviewReceiveMessageHandler(context, frontendMessage);
                        }, 1200);
                    });
                    return; // Exit and let the delayed callback handle it once opened
                }

                const os = require('os');
                const cp = require('child_process');
                const dbPath = `${os.homedir()}/.idaes/reportdb.sqlite`;
                // Securely query just the json report block for this explicit filename/name or exact ID
                let queryCmd = '';
                if (frontendMessage.id) {
                    queryCmd = `sqlite3 ${dbPath} "SELECT report FROM reports WHERE id = ${frontendMessage.id};"`;
                } else {
                    queryCmd = `sqlite3 ${dbPath} "SELECT report FROM reports WHERE coalesce(nullif(name, ''), filename) = '${frontendMessage.name}' ORDER BY id DESC LIMIT 1;"`;
                }
                
                cp.exec(queryCmd, { maxBuffer: 1024 * 1024 * 10 }, (err: any, stdout: string, stderr: string) => {
                    if (err) {
                        brodcastMessage({ type: 'error', message: `Failed to load historical run: ${err.message || stderr}` });
                        return;
                    }
                    if (stdout && stdout.trim().length > 0) {
                        try {
                            // Python's json.dumps() can produce raw Infinity, -Infinity, and NaN which break JS JSON.parse.
                            // Convert them to null to safely deserialize into JS.
                            let safeJsonString = stdout.trim()
                                .replace(/:\s*Infinity/g, ': null')
                                .replace(/:\s*-Infinity/g, ': null')
                                .replace(/:\s*NaN/g, ': null');
                            
                            const parsedData = JSON.parse(safeJsonString);
                            console.log('Successfully fetched and parsed historical flowsheet JSON blob.');
                            // Piggyback onto the existing live-run pipeline!
                            brodcastMessage({ type: 'flowsheet_runner_result', data: parsedData });
                        } catch (parse_err) {
                            brodcastMessage({ type: 'error', message: `Failed to parse historical JSON run data: ${parse_err}` });
                        }
                    } else {
                        brodcastMessage({ type: 'error', message: `No historical data found for ${frontendMessage.id || frontendMessage.name}` });
                    }
                });
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
        openCommand = 'flowsheet-inspector.openWebView';
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

