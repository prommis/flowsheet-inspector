import * as vscode from 'vscode';
import { getDefaultShellConfig } from './platform_config';

// Old broken Linux default — replaced by eval "$(conda shell.bash hook)"
const STALE_LINUX_SOURCE = 'source ~/.bashrc';

export function setDefaultConfig(context: vscode.ExtensionContext) {
    console.log("Checking extension config...");
    const stored = context.globalState.get<{
        activate_command: string;
        sorce_treminal: string;
        shell: string;
    }>("extensionConfig");

    const defaultConfig = getDefaultShellConfig();

    if (stored) {
        // Migrate stale Linux configs that used the non-interactive-safe source command
        if (stored.sorce_treminal === STALE_LINUX_SOURCE) {
            console.log("Migrating stale Linux sorce_treminal to conda shell hook...");
            context.globalState.update("extensionConfig", {
                ...stored,
                sorce_treminal: defaultConfig.sorce_treminal,
            });
        } else {
            console.log("User's config profile found:", stored);
        }
        return;
    }

    console.log("No config found, writing default:", defaultConfig);
    context.globalState.update("extensionConfig", defaultConfig);
}