import * as vscode from 'vscode';
import { activateWebviews, brodcastMessage } from "./webview_handler";
import { IExtensionConfig, IFlowsheetRunResult } from '../interface';
import runTerminalCommand from "./run_terminal_command";
import variableView from '../varibale_view/variable_view';

export default async function runFlowsheet(context: vscode.ExtensionContext, webview: vscode.Webview, selectedStep: string | undefined) {
    try {
        const activateFileName = context.globalState.get<string>("activatedFileName");
        const extensionConfig = context.globalState.get<IExtensionConfig>("extensionConfig");

        // read run_flowsheet necessary params
        let activateCommand = undefined;
        let sourceTerminal = undefined;
        let outputFileName = undefined;
        let shell = undefined;
        let vscodeContextStateName = 'flowsheetRunResult';

        if (extensionConfig) {
            sourceTerminal = extensionConfig.sorce_treminal;
            activateCommand = extensionConfig.activate_command;
            outputFileName = extensionConfig.output_file_name;
            shell = extensionConfig.shell;
        }

        // error handler if missing param
        if (!sourceTerminal || !activateCommand || !outputFileName || !shell || !vscodeContextStateName) {
            webview.postMessage({
                type: 'error',
                message: `run_flowsheet raise an error, looks like you are trying to run a flowsheet, but missing one of following params: [
                    sourceTerminal: ${sourceTerminal}, 
                    activateCommand: ${activateCommand},
                    outputFileName: ${outputFileName},
                    shell: ${shell},
                    vscodeContextStateName: ${vscodeContextStateName}
                From file webview_receive_message_handler.ts`
            });
            return;
        }

        // if webview is closed then open it to prevent extension cant find webview
        if (!activateWebviews.get('variableView')) {
            await variableView(context);
        }

        // GUARD: Prevent arbitrary file overwriting (e.g. wiping out ~/.zshrc)
        if (!outputFileName.toLowerCase().trim().endsWith('.json')) {
            vscode.window.showErrorMessage(`DANGER: Target output file "${outputFileName}" must be a .json file! Or it may overwrite your files. Check Extension Settings.`);
            webview.postMessage({
                type: 'error',
                message: `run_flowsheet aborted: The 'Output File Name' parameter (${outputFileName}) must be a .json file. Refusing to execute to prevent overwriting critical system files.`
            });
            return;
        }

        // run command
        let command = `${sourceTerminal} && ${activateCommand} && idaes-run "${activateFileName}" "${outputFileName}"`;
        if (selectedStep) {
            command += ` --to ${selectedStep}`;
        }
        console.log(`Run command: ${command}`);

        // Broadcast a signal to clear logs across ALL active webviews BEFORE starting new command
        brodcastMessage({ type: 'clear_terminal_logs' });

        await runTerminalCommand(context, command, shell, outputFileName, vscodeContextStateName);


        let webViewPanel = activateWebviews.get('webView');
        let variableViewPanel = activateWebviews.get('variableView');
        let treePanel = activateWebviews.get('treeView');
        let flowsheetRunResult = context.globalState.get<IFlowsheetRunResult>(vscodeContextStateName);

        if (!variableViewPanel) {
            console.error('variable view panel not found - user may not have opened the variable view tab');
            return;
        }

        if (!webViewPanel) {
            console.log('web view panel not found, proactively opening it...');
            await openWebViewPanel(context);
            webViewPanel = activateWebviews.get('webView');

            if (!webViewPanel) {
                console.error('webView panel still not found after attempting to open it');
                return;
            }
        }

        if (!treePanel) {
            console.error('tree view not found!');
            return;
        }

        if (!flowsheetRunResult) {
            console.error('flowsheet run result not found');
            webViewPanel.webview.postMessage({
                type: 'error',
                message: 'finished running the flowsheet, butflowsheet run result not found'
            });
            return;
        }

        console.log('Start post run flowsheet done to all panels');
        // post flowsheet result to variable view
        variableViewPanel.webview.postMessage({
            type: "flowsheet_runner_result",
            data: flowsheetRunResult
        });

        // post flowsheet result to web view
        webViewPanel.webview.postMessage({
            type: 'flowsheet_runner_result',
            data: flowsheetRunResult
        });

        // post flowsheet result to tree view
        treePanel.webview.postMessage({
            type: 'flowsheet_runner_result',
            data: flowsheetRunResult
        });

        // this is telling tree panel to cancel the loading animation
        treePanel.webview.postMessage({
            type: 'run_flowsheet_done',
        });
        console.log('Done');


        // mermaid content handler post mermaid diagram to web view or log error
        // const mermaidContent = flowsheetRunResult.actions.mermaid_diagram;
        // if (mermaidContent) {
        //     console.log(`Find mermaid content from flowsheet run result:`);
        //     console.log(`mermaid content: ${JSON.stringify(mermaidContent)}`);
        //     console.log(`Now sending mermaid content back to web view...`);
        //     webViewPanel.webview.postMessage({
        //         type: "update_mermaid_diagram",
        //         data: mermaidContent
        //     });
        //     console.log(`Done.`);

        // } else {
        //     console.error('mermaid content not found');
        // }

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);

        if (errorMessage.startsWith('CANCELED_BY_USER')) {
            // Silently swallow the rejection and log to console
            console.log(`runFlowsheet was canceled by the user: ${errorMessage}`);
            const pidChunk = errorMessage.split(':')[1] || '';
            vscode.window.showInformationMessage(`Run flowsheet stopped manually. PID: ${pidChunk}`, 'Click to view').then((selection) => {
                if (selection === 'Click to view') {
                    // Focus the webView panel (which contains logs)
                    vscode.commands.executeCommand('idaes.webView.focus').then(() => {
                        // Send a broadcast to switch the active tab to 'logs'
                        setTimeout(() => {
                            brodcastMessage({ type: 'switch_sub_tab', tab_name: 'logs', sub_tab_name: 'terminal' });
                        }, 300);
                    });
                }
            });
            return;
        }

        console.error(`
            runFlowsheet from webview_receive_message_handler.ts raise an error:
            ${e}
        `);

        let webViewPanel = activateWebviews.get('webView');

        // if not webview panel try to open it, because the error should send to this panel to show in log
        if (!webViewPanel) {
            await openWebViewPanel(context);
            webViewPanel = activateWebviews.get('webView');

            // if still not found then log error
            if (!webViewPanel) {
                console.error('web view panel not found');
                return;
            }
        }

        webViewPanel.webview.postMessage({
            type: 'error',
            message: errorMessage
        });

        webViewPanel.webview.postMessage({
            type: 'error',
            message: errorMessage
        });

        // Inform the tree panel that the run failed so it stops the timer/spinner
        let treePanel = activateWebviews.get('treeView');
        if (treePanel) {
            treePanel.webview.postMessage({
                type: 'run_flowsheet_done' // This sets `isRunningFlowsheet = false` in the frontend (though they cancel flowsheet currently resets it too)
            });
        }
    }
}


async function openWebViewPanel(context: vscode.ExtensionContext) {
    let webViewPanel = activateWebviews.get('webView');
    // Step 1: Open the bottom panel area and the specific extension container
    try {
        await vscode.commands.executeCommand('workbench.action.focusPanel');
        await vscode.commands.executeCommand('workbench.view.extension.idaes-web-view-panel');
    } catch (e) {
        brodcastMessage({
            type: 'error',
            message: `focusPanel command failed: ${e}`
        });
    }

    // Step 2: Switch to the idaes web view specifically
    try {
        await vscode.commands.executeCommand('idaes.webView.focus');
    } catch (e) {
        console.log('idaes.webView.focus command failed', e);
    }

    // Step 3: Wait until the panel registers itself (retry loop for up to 3 seconds)
    let retries = 0;
    while (!webViewPanel && retries < 15) {
        await new Promise(resolve => setTimeout(resolve, 200));
        webViewPanel = activateWebviews.get('webView');
        retries++;
    }

    // Also give the React app inside the webview an extra 1000ms to boot up and be ready for messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!webViewPanel) {
        console.error('webView panel still not found after attempting to open it for 3 seconds');
        return;
    }
}