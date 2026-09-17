import * as vscode from 'vscode';
import { isWrappedFlowsheet } from '../util/validate_flowsheet';
import { getReactTemplate } from '../util/get_webview_template';
import { registerWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import webviewReceiveMessageHandler from "../util/webview_receive_message_handler";
import { checkActivePythonEnv } from '../util/extension_initial_check';
import { checkRequiredPackages } from '../util/check_required_packages';
import { runFiSteps } from '../util/run_fi_steps';
import { getActivePythonEnv, broadcastCurrentPythonEnv } from '../util/python_env';
import { getPlatform } from '../util/platform_config';
import { checkReportDb, reportDbBlocksRun, STEPS_BLOCKED_BY_DB_MSG, type IReportDbCheck } from '../util/report_db_tools';

export default function treeview(context: vscode.ExtensionContext) {
    return {
        async resolveWebviewView(webviewView: vscode.WebviewView) {
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src')]
            };

            // define webview template
            webviewView.webview.html = getReactTemplate(context, webviewView.webview, '', '');

            // register webview
            registerWebview("treeView", webviewView);


            let fileName = '';

            let reactReady = false;

            const initializeApp = async () => {
                if (!reactReady) {
                    return;
                }

                // Re-resolve the active file on every call.
                // When the sidebar first loads it holds focus, making
                // activeTextEditor undefined — fall back to any visible Python
                // editor, then to globalState from a previous session.
                const activeFile = vscode.window.activeTextEditor?.document.fileName;
                const visiblePyFile = vscode.window.visibleTextEditors
                    .find(e => e.document.fileName.endsWith('.py'))
                    ?.document.fileName;
                fileName = (activeFile?.endsWith('.py') ? activeFile : null)
                    ?? visiblePyFile
                    ?? context.globalState.get<string>("activatedFileName")
                    ?? '';

                // 1. Initial UI Loading (empty state)
                webviewView.webview.postMessage({
                    type: "init",
                    content: '',
                    idaesRunInfo: null,
                    fileName: fileName !== '' ? trimFileName(fileName) : 'No file selected',
                    loadApp: 'treeView',
                    osPlatform: getPlatform()
                });

                if (!fileName.endsWith('.py')) {
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName) || 'No file selected',
                        idaesRunInfo: null,
                        initError: `No Python flowsheet file is currently active.\nPlease open a flowsheet file to use Flowsheet Inspector.`,
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                if (!isWrappedFlowsheet(fileName)) {
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: `"${trimFileName(fileName)}" is not a wrapped flowsheet file.\nFlowsheet Inspector requires @FS.step("build") to be present in the file.`,
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 3. Start Loading state for the flowsheet data
                webviewView.webview.postMessage({
                    type: 'switch_tab',
                    activate_tab_name: trimFileName(fileName),
                    isLoading: true,
                    time: new Date().toISOString(),
                });

                // 4. Run environment pre-checks against the selected interpreter
                const envCheck = await checkActivePythonEnv(fileName ? vscode.Uri.file(fileName) : undefined);
                if (!envCheck.success) {
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: envCheck.errorMsg,
                        packageWarnings: [],
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 5. Check required packages — non-blocking; missing ones become warnings
                const resolvedEnv = await getActivePythonEnv(fileName ? vscode.Uri.file(fileName) : undefined);
                // The report DB schema check runs alongside the package check:
                // an outdated DB is surfaced as a banner with an "Update
                // database" button rather than blocking the step list.
                const [packageWarnings, reportDbStatus]: [any[], IReportDbCheck | null] = resolvedEnv
                    ? await Promise.all([checkRequiredPackages(resolvedEnv), checkReportDb(resolvedEnv)])
                    : [[], null];
                console.log(`[treeview] package warnings: ${JSON.stringify(packageWarnings)}`);
                console.log(`[treeview] report db status: ${JSON.stringify(reportDbStatus)}`);

                // 6. A blocking report DB (outdated or newer than the lib) means
                // fi-steps would only refuse with exit 3: skip it, show the banner
                // and the "steps unavailable" line; the post-migration reload
                // fetches the steps once the DB is current.
                if (reportDbBlocksRun(reportDbStatus)) {
                    console.log(`[treeview] skipping fi-steps: report DB ${reportDbStatus?.status}`);
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: STEPS_BLOCKED_BY_DB_MSG,
                        packageWarnings,
                        reportDbStatus,
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 7. Run fi-steps with the selected interpreter to get step info
                let resolvedStepsData: any = null;
                try {
                    resolvedStepsData = await runFiSteps(fileName);
                    console.log(resolvedStepsData);
                } catch (err: any) {
                    console.error(`Error running fi-steps during tree view load: ${err.message}`);
                    // fi-steps reports the DB state itself when it refuses to
                    // run (exit 3); that is fresher than the check made before.
                    const dbStatus: IReportDbCheck | null = err.dbCheck ?? reportDbStatus;
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: reportDbBlocksRun(dbStatus)
                            ? STEPS_BLOCKED_BY_DB_MSG
                            : `Failed to load flowsheet info: ${err.message}`,
                        packageWarnings,
                        reportDbStatus: dbStatus,
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 8. Update UI with the result (success, with any non-blocking warnings)
                webviewView.webview.postMessage({
                    type: 'switch_tab',
                    activate_tab_name: trimFileName(fileName),
                    idaesRunInfo: resolvedStepsData || null,
                    initError: null,
                    packageWarnings,
                    reportDbStatus,
                    isLoading: false,
                    time: new Date().toISOString(),
                });
            };

            webviewView.webview.onDidReceiveMessage(
                message => {
                    if (message.type === "error") {
                        vscode.window.showErrorMessage(message.content);
                        console.error(`Received error from frontend: ${message.content}`);
                    } else if (message.frontendInstruction === 'ready') {
                        reactReady = true;
                        initializeApp();
                        broadcastCurrentPythonEnv().catch((e) => console.error(`Failed to broadcast python env: ${e}`));
                    } else {
                        webviewReceiveMessageHandler(context, message);
                    }
                }
            );
        }
    };
}