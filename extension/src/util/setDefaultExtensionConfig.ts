import * as vscode from 'vscode';
import { getDefaultShellConfig } from './platform_config';

export function setDefaultConfig(context: vscode.ExtensionContext) {
    // reading user's extension config from vscode global state
    console.log("Checking extension config...");
    console.log("Hint:Config stored at VSCode context.globalState");
    const hasConfigFile = context.globalState.get<{
        activate_command: string;
        sorce_treminal: string;
        output_file_name: string;
        shell: string;
    }>("extensionConfig");


    if (hasConfigFile) {
        console.log("User's config profile found!");
        const userConfig = context.globalState.get("extensionConfig");
        console.log("user's config is:");
        console.log(userConfig);
        console.log("Now use user's config!");
        return;
    } else {
        console.log("User's config file not found, creating default config...");
        const defaultExtensionConfig = getDefaultShellConfig();

        context.globalState.update("extensionConfig", defaultExtensionConfig);

        // reading config and log it
        const config = context.globalState.get("extensionConfig");
        console.log("Default config is created! The default config is:");
        console.log(config);
    }
}