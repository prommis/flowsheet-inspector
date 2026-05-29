import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { isWrappedFlowsheet } from '../util/validate_flowsheet';
import { getReactTemplate } from '../util/get_webview_template';
import { IExtensionConfig } from '../interface';
import { registerWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import { readExtensionConfig, updateExtensionConfig } from '../util/extensionHandler';
import webviewReceiveMessageHandler from "../util/webview_receive_message_handler";
import { checkExtensionConfigEnv } from '../util/extension_initial_check';
import { buildCommandChain, getPlatform, getSpawnArgs, getSpawnOptions } from '../util/platform_config';

export default function treeview(context: vscode.ExtensionContext) {
    return {
        async resolveWebviewView(webviewView: vscode.WebviewView) {
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))]
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

                // 4. Run environment pre-checks
                const envCheck = await checkExtensionConfigEnv(extensionConfigData);
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

                // 5. Run fi-steps to get flowsheet step info
                const sorceCommand = extensionConfigData.sorce_treminal;
                const activateCommand = extensionConfigData.activate_command;
                const shellType = extensionConfigData.shell;

                const commandFiSteps = buildCommandChain([sorceCommand, activateCommand, `fi-steps --fs "${fileName}" -t json`]);

                let resolvedStepsData: any = null;
                try {
                    resolvedStepsData = await new Promise<any>((resolve, reject) => {
                        const { shell: resolvedShell, args: shellArgs } = getSpawnArgs(shellType, commandFiSteps);
                        console.log(`[fi-steps] Spawning: ${resolvedShell} ${JSON.stringify(shellArgs)}`);
                        const child = cp.spawn(resolvedShell, shellArgs, {
                            stdio: 'pipe' as const,
                            windowsHide: true,
                        });
                        let stdout = '';
                        let stderr = '';
                        child.stdout.on('data', (d) => { stdout += d.toString(); });
                        child.stderr.on('data', (d) => { stderr += d.toString(); });
                        child.on('close', (code) => {
                            if (code !== 0) {
                                const errDetail = stderr.trim() || stdout.trim() || '(no output)';
                                reject(new Error(`fi-steps failed (exit ${code}): ${errDetail}`));
                                return;
                            }
                            try {
                                // fi-steps outputs a JSON array to stdout, but shell banners
                                // from .zshrc/.bashrc may precede it. Extract the JSON line.
                                const lines = stdout.trim().split('\n');
                                const jsonLine = lines.reverse().find(l => l.trim().startsWith('['));
                                if (!jsonLine) {
                                    reject(new Error(`No JSON array found in fi-steps output.\nSTDOUT: ${stdout.trim().slice(0, 500)}\nSTDERR: ${stderr.trim().slice(0, 500)}`));
                                    return;
                                }
                                const steps = JSON.parse(jsonLine.trim());
                                resolve({ classname: 'FlowsheetRunner', steps });
                            } catch (e) {
                                reject(new Error(`Failed to parse fi-steps output: ${e}`));
                            }
                        });
                        child.on('error', reject);
                    });
                    console.log(resolvedStepsData);
                } catch (err: any) {
                    console.error(`Error running fi-steps during tree view load: ${err.message}`);
                    webviewView.webview.postMessage({
                        type: 'switch_tab',
                        activate_tab_name: trimFileName(fileName),
                        idaesRunInfo: null,
                        initError: `Failed to load flowsheet info: ${err.message}. Please check your configuration.`,
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