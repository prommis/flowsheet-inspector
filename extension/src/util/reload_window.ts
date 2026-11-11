import * as vscode from 'vscode';
import { getReactTemplate } from './get_webview_template';
import { activateWebviews } from './webview_handler';

/** Reload every currently registered sidebar/editor webview from the latest bundle. */
export function reloadAllWebviews(context: vscode.ExtensionContext): number {
    let reloadCount = 0;

    for (const [name, view] of activateWebviews) {
        try {
            view.webview.html = getReactTemplate(context, view.webview, '', '');
            reloadCount += 1;
        } catch (error) {
            console.error(`Failed to reload webview ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return reloadCount;
}
