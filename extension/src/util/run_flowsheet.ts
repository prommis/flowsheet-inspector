/**
 * Orchestrates a fi-run execution for the currently active flowsheet file.
 *
 * Uses the Python interpreter VS Code has selected (via the Python extension
 * API) to locate and spawn fi-run directly — no shell, no conda activate, no
 * dependency on the user's PATH or shell init files.  This mirrors how fi-steps
 * is invoked and makes the runner work on Windows without any extra config.
 */
import * as vscode from 'vscode';
import { activateWebviews, brodcastMessage } from './webview_handler';
import openWebView from '../web_view/web_view_panel';
import { queryLatestReport } from './sqlite_reader';
import runTerminalCommand from './run_terminal_command';
import { getActivePythonEnv, activatedProcessEnv } from './python_env';
import { getMaxReportId, startStepStatusPolling, stopStepStatusPolling, broadcastFinalStepStatus } from './step_status_polling';

const NO_INTERPRETER_MSG =
    'No Python interpreter selected. Pick the environment with Flowsheet Inspector ' +
    'installed via the Python: Select Interpreter command (bottom-right status bar).';

/**
 * Runs fi-run for the flowsheet file currently stored in VS Code global state.
 *
 * Resolves the active interpreter from the VS Code Python extension, locates
 * the fi-run entry point inside that environment, and spawns it directly with
 * an activated PATH — identical to the fi-steps approach.  stdout/stderr are
 * streamed to the terminal log panel in real time.
 *
 * @param context       Extension context; used to read the active file name.
 * @param webview       The webview that triggered the run (used to post errors).
 * @param selectedStep  Optional step name to pass as `--last <step>` to fi-run.
 */
export default async function runFlowsheet(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    selectedStep: string | undefined,
): Promise<void> {
    const postError = (message: string) => {
        webview.postMessage({ type: 'error', message });
        activateWebviews.get('treeView')?.webview.postMessage({ type: 'run_flowsheet_done' });
    };

    try {
        const activateFileName = context.globalState.get<string>('activatedFileName');
        if (!activateFileName) {
            postError('No flowsheet file is currently active. Open a flowsheet file first.');
            return;
        }

        // Resolve the interpreter the user has selected in VS Code
        const env = await getActivePythonEnv(vscode.Uri.file(activateFileName));
        if (!env) {
            postError(NO_INTERPRETER_MSG);
            return;
        }

        const args: string[] = ['-m', 'idaes_fi.structfs.fsrunner', activateFileName];
        if (selectedStep) {
            args.push('--last', selectedStep);
        }

        const childEnv: NodeJS.ProcessEnv = {
            ...activatedProcessEnv(env),
            PYTHONUNBUFFERED: '1',
            FORCE_COLOR: '1',
        };

        // Ensure the results panel is open before streaming starts
        if (!activateWebviews.get('webView')) {
            await openWebView(context);
        }

        // Clear stale run state from the UI before starting
        brodcastMessage({ type: 'start_new_run' });
        brodcastMessage({ type: 'clear_terminal_logs' });

        // Capture the current highest report id BEFORE launching fi-run. fi-run
        // inserts an empty report row up front and writes one `status` row per
        // step as it finishes, so polling for rows belonging to a report id
        // greater than this baseline lets us surface live per-step progress
        // (running / success / failure) in the tree view while the run is going.
        const baselineReportId = await getMaxReportId();
        let stepStatusPoller: NodeJS.Timeout | undefined;
        try {
            stepStatusPoller = startStepStatusPolling(baselineReportId);
            await runTerminalCommand(env.interpreterPath, args, childEnv);
        } finally {
            stopStepStatusPolling(stepStatusPoller);
            // The interval can miss the very last step row written as fi-run
            // exits, so emit one final authoritative status broadcast.
            broadcastFinalStepStatus(baselineReportId);
        }

        console.log('fi-run completed. Reading latest report from SQLite...');

        try {
            const reportData = queryLatestReport();
            if (!reportData) {
                throw new Error('No report found in database');
            }
            console.log('Successfully loaded report from SQLite. Broadcasting to webviews...');
            brodcastMessage({ type: 'flowsheet_runner_result', data: reportData });
        } catch (dbErr: any) {
            console.warn(`Could not load report from SQLite (non-fatal): ${dbErr.message}`);
            brodcastMessage({
                type: 'terminal_log',
                data: `\n[SYSTEM] fi-run completed but could not read report from database: ${dbErr.message}\nResults may appear in the history panel shortly.\n`,
            });
        }

        activateWebviews.get('treeView')?.webview.postMessage({ type: 'run_flowsheet_done' });

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);

        if (errorMessage.startsWith('CANCELED_BY_USER')) {
            const pidChunk = errorMessage.split(':')[1] ?? '';
            console.log(`runFlowsheet was canceled by the user. PID: ${pidChunk}`);
            vscode.window.showInformationMessage(`Run flowsheet stopped manually. PID: ${pidChunk}`);
            activateWebviews.get('treeView')?.webview.postMessage({ type: 'run_flowsheet_done' });
            return;
        }

        console.error(`runFlowsheet error: ${e}`);

        let webViewPanel = activateWebviews.get('webView');
        if (!webViewPanel) {
            await openWebView(context);
            webViewPanel = activateWebviews.get('webView');
        }
        webViewPanel?.webview.postMessage({ type: 'error', message: errorMessage });
        activateWebviews.get('treeView')?.webview.postMessage({ type: 'run_flowsheet_done' });
    }
}
