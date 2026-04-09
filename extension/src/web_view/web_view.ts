import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { getReactTemplate } from '../util/get_webview_template';
import { IExtensionConfig } from '../interface';
import { registerWebview, unregisterWebview } from '../util/webview_handler';
import { trimFileName } from '../util/trim_file_name';
import webviewReceiveMessageHandler from '../util/webview_receive_message_handler';

export default function webView(context: vscode.ExtensionContext) {
    return {
        async resolveWebviewView(webviewView: vscode.WebviewView) {
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))]
            };

            // define webview template
            webviewView.webview.html = getReactTemplate(context, webviewView.webview, '', '');

            // register webview
            registerWebview("webView", webviewView);

            //Get current activate tab's file name
            let fileName = context.globalState.get<string>("activatedFileName") ?? '';

            //Get config data from vscode global state
            const extensionConfigData: IExtensionConfig | undefined = context.globalState.get("extensionConfig");

            if (!extensionConfigData) {
                // when extension config not found from global state, show error message
                webviewView.webview.postMessage(
                    {
                        error: "Error at loading tree view!Config not found! Please set the config first!"
                    }
                );
                return;
            } else {
                // get command config data
                const sorceCommand = extensionConfigData.sorce_treminal;
                const activateCommand = extensionConfigData.activate_command;
                const outputFileName = extensionConfigData.output_file_name;

                // construct the idaes-run info command
                const cpCommand = `${sorceCommand} && ${activateCommand} && idaes-run ${fileName} ${outputFileName} --info`;

                webviewView.webview.onDidReceiveMessage(
                    message => {
                        if (message.frontendInstruction === 'ready') {
                            webviewView.webview.postMessage(
                                {
                                    type: "init",
                                    content: '',
                                    idaesRunInfo: {},
                                    fileName: fileName !== '' ? trimFileName(fileName) : "File name undefined",
                                    loadApp: 'webView'
                                }
                            );
                        } else {
                            webviewReceiveMessageHandler(context, message);
                        }
                    }
                );
            }

            webviewView.onDidDispose(() => {
                unregisterWebview("webView");
            });
        }
    };
}