import * as vscode from 'vscode';
import { isWrappedFlowsheet } from '../util/validate_flowsheet';
import { getReactTemplate } from '../util/get_webview_template';
import { registerWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import { readExtensionConfig, updateExtensionConfig } from '../util/extensionHandler';
import webviewReceiveMessageHandler from "../util/webview_receive_message_handler";
import { checkActivePythonEnv } from '../util/extension_initial_check';
import { checkRequiredPackages } from '../util/check_required_packages';
import { runFiSteps } from '../util/run_fi_steps';
import { getActivePythonEnv, broadcastPythonEnvUpdate, triggerPythonEnvRefresh, listPythonEnvs } from '../util/python_env';
import { getPlatform } from '../util/platform_config';

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


            //Get config data from vscode global state
            // const extensionConfigData: IExtensionConfig | undefined = context.globalState.get("extensionConfig");
            let extensionConfigData = readExtensionConfig(context);
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

                if (!extensionConfigData) {
                    extensionConfigData = {
                        sorce_treminal: "",
                        activate_command: "",
                        shell: "/bin/zsh"
                    };
                }

                // Send extension config to react, so user can edit if needed
                webviewView.webview.postMessage({
                    type: "readExtensionConfig",
                    content: extensionConfigData,
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
                const packageWarnings = resolvedEnv
                    ? await checkRequiredPackages(resolvedEnv)
                    : [];
                console.log(`[treeview] package warnings: ${JSON.stringify(packageWarnings)}`);

                // 6. Run fi-steps with the selected interpreter to get step info
                let resolvedStepsData: any = null;
                try {
                    resolvedStepsData = await runFiSteps(fileName);
                    console.log(resolvedStepsData);
                } catch (err: any) {
                    console.error(`Error running fi-steps during tree view load: ${err.message}`);
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: `Failed to load flowsheet info: ${err.message}`,
                        packageWarnings,
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 7. Update UI with the result (success, with any non-blocking warnings)
                webviewView.webview.postMessage({
                    type: 'switch_tab',
                    activate_tab_name: trimFileName(fileName),
                    idaesRunInfo: resolvedStepsData || null,
                    initError: null,
                    packageWarnings,
                    isLoading: false,
                    time: new Date().toISOString(),
                });
            };

            // register message handler immediately so UI can update configs
            webviewView.webview.onDidReceiveMessage(
                message => {
                    if (message.type === "updateExtensionConfig") {
                        updateExtensionConfig(context, message.content);
                        extensionConfigData = message.content;
                        vscode.window.showInformationMessage("Configuration updated successfully");
                        initializeApp();
                    } else if (message.type === "error") {
                        vscode.window.showErrorMessage(message.content);
                        console.error(`Received error from frontend: ${message.content}`);
                    } else if (message.frontendInstruction === 'ready') {
                        reactReady = true;
                        initializeApp();
                        // Push the env list immediately so the dropdown fills
                        // on first open.  Only trigger a re-discovery pass when
                        // the list is empty — avoids kicking off a slow full
                        // scan on every sidebar open when envs are already known.
                        broadcastPythonEnvUpdate().then(async () => {
                            const { envs } = await listPythonEnvs();
                            if (envs.length === 0) {
                                triggerPythonEnvRefresh().catch((e) => console.error(`Failed to refresh python envs: ${e}`));
                            }
                        }).catch((e) => console.error(`Failed to broadcast python envs: ${e}`));
                    } else {
                        webviewReceiveMessageHandler(context, message);
                    }
                }
            );
        }
    };
}