import * as vscode from 'vscode';
import { IExtensionConfig } from '../interface';

export function readExtensionConfig(context: vscode.ExtensionContext) {
    const extensionConfigData: IExtensionConfig | undefined = context.globalState.get("extensionConfig");
    if (!extensionConfigData) {
        vscode.window.showErrorMessage("Error at loading tree view!Config not found! Please set the config first!");
        return;
    }
    return extensionConfigData;
}

export function updateExtensionConfig(context: vscode.ExtensionContext, updateConfig: IExtensionConfig) {
    console.log(`receive update extension message from react, ready to update extension config: ${JSON.stringify(updateConfig)}`);
    context.globalState.update("extensionConfig", updateConfig);
    console.log(`Done`);
}