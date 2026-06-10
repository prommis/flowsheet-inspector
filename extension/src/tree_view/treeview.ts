import * as vscode from 'vscode';
import { isWrappedFlowsheet } from '../util/validate_flowsheet';
import { getReactTemplate } from '../util/get_webview_template';
import { registerWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import { readExtensionConfig, updateExtensionConfig } from '../util/extensionHandler';
import webviewReceiveMessageHandler from "../util/webview_receive_message_handler";
import { checkActivePythonEnv } from '../util/extension_initial_check';
import { runFiSteps } from '../util/run_fi_steps';
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


            // Prefer the currently active editor over stale globalState from a previous session
            const currentActiveFile = vscode.window.activeTextEditor?.document.fileName;
            let fileName = (currentActiveFile?.endsWith('.py') ? currentActiveFile : null)
                ?? context.globalState.get<string>("activatedFileName")
                ?? '';

            //Get config data from vscode global state
            // const extensionConfigData: IExtensionConfig | undefined = context.globalState.get("extensionConfig");
            let extensionConfigData = readExtensionConfig(context);

            let reactReady = false;

            const initializeApp = async () => {
                if (!reactReady) {
                    return;
                }

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
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 5. Run fi-steps with the selected interpreter to get step info
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
                        isLoading: false,
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // 5. Update UI with the result (success)
                webviewView.webview.postMessage({
                    type: 'switch_tab',
                    activate_tab_name: trimFileName(fileName),
                    idaesRunInfo: resolvedStepsData || null,
                    initError: null,
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
                    } else {
                        webviewReceiveMessageHandler(context, message);
                    }
                }
            );
        }
    };
}