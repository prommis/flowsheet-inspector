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


        let variableViewPanel = activateWebviews.get('variableView');
        let treePanel = activateWebviews.get('treeView');
        let flowsheetRunResult = context.globalState.get<IFlowsheetRunResult>(vscodeContextStateName);

        if (!variableViewPanel) {
            console.error('variable view panel not found - user may not have opened the variable view tab');
            return;
        }

        if (!treePanel) {
            console.error('tree view not found!');
            return;
        }

        if (!flowsheetRunResult) {
            console.error('flowsheet run result not found');
            variableViewPanel.webview.postMessage({
                type: 'error',
                message: 'finished running the flowsheet, but flowsheet run result not found'
            });
            return;
        }

        console.log('Start post run flowsheet done to all panels');
        // post flowsheet result to variable view
        variableViewPanel.webview.postMessage({
            type: "flowsheet_runner_result",
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

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);

        if (errorMessage.startsWith('CANCELED_BY_USER')) {
            // Silently swallow the rejection and log to console
            console.log(`runFlowsheet was canceled by the user: ${errorMessage}`);
            const pidChunk = errorMessage.split(':')[1] || '';
            vscode.window.showInformationMessage(`Run flowsheet stopped manually. PID: ${pidChunk}`);
            return;
        }

        console.error(`
            runFlowsheet from webview_receive_message_handler.ts raise an error:
            ${e}
        `);

        let variableViewPanel = activateWebviews.get('variableView');

        // if not variable view panel, try to open it 
        if (!variableViewPanel) {
            await variableView(context);
            variableViewPanel = activateWebviews.get('variableView');
        }

        if (variableViewPanel) {
            variableViewPanel.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        } else {
            console.error('variable view panel not found to report error');
        }

        // Inform the tree panel that the run failed so it stops the timer/spinner
        let treePanel = activateWebviews.get('treeView');
        if (treePanel) {
            treePanel.webview.postMessage({
                type: 'run_flowsheet_done' // This sets `isRunningFlowsheet = false` in the frontend (though they cancel flowsheet currently resets it too)
            });
        }
    }
}