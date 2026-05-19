import * as vscode from 'vscode';
import * as cp from 'child_process';
import { activateWebviews, brodcastMessage } from "./webview_handler";
import { IExtensionConfig } from '../interface';
import runTerminalCommand from "./run_terminal_command";
import openWebView from '../web_view/web_view_panel';
import { buildCommandChain, getIdaesDbPath, buildSqliteCommand } from './platform_config';

export default async function runFlowsheet(context: vscode.ExtensionContext, webview: vscode.Webview, selectedStep: string | undefined) {
    try {
        const activateFileName = context.globalState.get<string>("activatedFileName");
        const extensionConfig = context.globalState.get<IExtensionConfig>("extensionConfig");

        // read run_flowsheet necessary params
        let activateCommand = undefined;
        let sourceTerminal = undefined;
        let shell = undefined;

        if (extensionConfig) {
            sourceTerminal = extensionConfig.sorce_treminal;
            activateCommand = extensionConfig.activate_command;
            shell = extensionConfig.shell;
        }

        // error handler if missing param
        if (!activateCommand || !shell) {
            webview.postMessage({
                type: 'error',
                message: `run_flowsheet raise an error, looks like you are trying to run a flowsheet, but missing one of following params: [
                    activateCommand: ${activateCommand},
                    shell: ${shell},
                From file webview_receive_message_handler.ts`
            });
            return;
        }

        // if webview is closed then open it to prevent extension cant find webview
        if (!activateWebviews.get('webView')) {
            await openWebView(context);
        }

        // Build the command chain using platform-appropriate separators
        // On Unix: `source ~/.zshrc && conda activate ... && fi-run ...`
        // On Windows: `conda activate ... ; fi-run ...` (empty sourceTerminal is filtered out)
        let runCmd = `fi-run "${activateFileName}"`;
        if (selectedStep) {
            runCmd += ` --last ${selectedStep}`;
        }
        let command = buildCommandChain([sourceTerminal, activateCommand, runCmd]);
        console.log(`Run command: ${command}`);

        // Broadcast a signal to clear previous run results (diagram, IPOPT, diagnostic, etc.) from the UI
        brodcastMessage({ type: 'start_new_run' });

        // Broadcast a signal to clear logs across ALL active webviews BEFORE starting new command
        brodcastMessage({ type: 'clear_terminal_logs' });

        await runTerminalCommand(context, command, shell);

        console.log('fi-run completed. Reading latest report from SQLite...');

        // Read the latest report from the SQLite database
        const dbPath = getIdaesDbPath();
        const reportQuery = `SELECT report FROM reports ORDER BY id DESC LIMIT 1;`;
        const sqliteCmd = buildSqliteCommand(dbPath, reportQuery);

        const reportData = await new Promise<any>((resolve, reject) => {
            cp.exec(sqliteCmd, { maxBuffer: 50 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Failed to read report from SQLite: ${err.message}`);
                    reject(err);
                    return;
                }
                try {
                    // Python's json.dumps can produce -Infinity, Infinity, NaN
                    // which are invalid in standard JSON. Replace with null.
                    const sanitized = stdout.trim()
                        .replace(/:\s*-Infinity/g, ': null')
                        .replace(/:\s*Infinity/g, ': null')
                        .replace(/:\s*NaN/g, ': null');
                    const parsed = JSON.parse(sanitized);
                    resolve(parsed);
                } catch (e) {
                    console.error(`Failed to parse report JSON from SQLite: ${e}`);
                    reject(e);
                }
            });
        });

        console.log('Successfully loaded report from SQLite. Broadcasting to webviews...');

        // Broadcast the full report to all webviews (same message type the frontend expects)
        brodcastMessage({
            type: 'flowsheet_runner_result',
            data: reportData
        });

        // Notify tree panel that the run is complete so it stops spinners
        let treePanel = activateWebviews.get('treeView');
        if (treePanel) {
            treePanel.webview.postMessage({
                type: 'run_flowsheet_done',
            });
        }
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

        let webViewPanel = activateWebviews.get('webView');

        // if not web view panel, try to open it 
        if (!webViewPanel) {
            await openWebView(context);
            webViewPanel = activateWebviews.get('webView');
        }

        if (webViewPanel) {
            webViewPanel.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        } else {
            console.error('web view panel not found to report error');
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