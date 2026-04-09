import * as vscode from 'vscode';
import * as path from 'path';
import { getReactTemplate } from '../util/get_webview_template';
import { IExtensionConfig } from '../interface';
import { registerWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import { readExtensionConfig, updateExtensionConfig } from '../util/extensionHandler';
import webviewReceiveMessageHandler from "../util/webview_receive_message_handler";
import runTerminalCommand from '../util/run_terminal_command';
import { checkExtensionConfigEnv } from '../util/extension_initial_check';

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


            //Get current activate tab's file name
            let fileName = context.globalState.get<string>("activatedFileName") ?? '';

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
                    loadApp: 'treeView'
                });

                if (!extensionConfigData) {
                    extensionConfigData = {
                        sorce_treminal: "",
                        activate_command: "",
                        output_file_name: "idaes_run_info.json",
                        shell: "/bin/zsh"
                    };
                }

                // Send extension config to react, so user can edit if needed
                webviewView.webview.postMessage({
                    type: "readExtensionConfig",
                    content: extensionConfigData,
                });

                if (!fileName.endsWith('.py')) {
                    vscode.window.showErrorMessage("Please open a python flowsheet file to use IDAES extension.");
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

                // 5. Run the terminal command 
                const sorceCommand = extensionConfigData.sorce_treminal;
                const activateCommand = extensionConfigData.activate_command;
                const outputFileName = extensionConfigData.output_file_name;
                const shellType = "/bin/zsh";

                const commandIdaesRunInfo = `${sorceCommand} && ${activateCommand} && idaes-run "${fileName}" "${outputFileName}" --info`;

                let resolvedStepsData: any = null;
                try {
                    resolvedStepsData = await runTerminalCommand(context, commandIdaesRunInfo, shellType, outputFileName, "currentFileInfo");
                    console.log(resolvedStepsData);
                } catch (err: any) {
                    console.error(`Error running terminal command during tree view load: ${err.message}`);
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