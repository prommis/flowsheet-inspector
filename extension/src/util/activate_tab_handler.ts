import * as vscode from 'vscode';
import { brodcastMessage, activateWebviews } from './webview_handler';
import { isWrappedFlowsheet } from './validate_flowsheet';
import { trimFileName } from './trim_file_name';
import { checkActivePythonEnv } from './extension_initial_check';
import { checkRequiredPackages } from './check_required_packages';
import { runFiSteps } from './run_fi_steps';
import { onDidChangeActivePythonEnv, broadcastCurrentPythonEnv, getActivePythonEnv } from './python_env';

function getOpenPythonFiles() {
    const pyFiles: { name: string, path: string }[] = [];
    const seenPaths = new Set<string>();

    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText) {
                const fsPath = tab.input.uri.fsPath;
                if (fsPath.endsWith('.py') && !seenPaths.has(fsPath)) {
                    seenPaths.add(fsPath);
                    pyFiles.push({
                        name: trimFileName(fsPath),
                        path: fsPath
                    });
                }
            }
        }
    }
    return pyFiles;
}

// One-shot record of a file that is about to gain editor focus because of a
// traceback-link jump (not because the user chose to work on it). Consumed by
// handleActiveEditor to skip the whole switch_tab flow for that activation.
let suppressedTabSwitch: { fsPath: string; expiresAt: number } | null = null;

/**
 * Marks the next editor activation of `fsPath` as a programmatic jump that
 * must not be treated as the user switching flowsheets.
 *
 * Why: clicking a traceback link in the webview logs opens the referenced file
 * in the editor, which fires onDidChangeActiveTextEditor exactly like a manual
 * tab switch. Without this, every debug jump makes the tree panel re-run
 * fi-steps / show a "not a wrapped flowsheet" banner and re-targets the
 * activated file. The record is one-shot (cleared on first match) and expires
 * after 2 s so a stale mark can never swallow a genuine tab switch later.
 *
 * @param fsPath Normalized filesystem path of the file about to be opened.
 */
export function suppressNextTabSwitchFor(fsPath: string) {
    suppressedTabSwitch = { fsPath, expiresAt: Date.now() + 2000 };
}

export default function activateTabListener(context: vscode.ExtensionContext) {
    vscode.window.tabGroups.onDidChangeTabs(() => {
        const openFiles = getOpenPythonFiles();
        brodcastMessage({
            type: 'update_open_files',
            open_python_files: openFiles,
            time: new Date().toISOString()
        });
    });

    /**
     * Notifies the webviews when the user saves the flowsheet file the tree
     * panel is currently targeting.
     *
     * Why: a saved edit means the results shown (diagram, variables, step
     * statuses) were produced from older code, so the frontend uses this
     * message to surface a "rerun the flowsheet" notice under the Run button.
     * Saves of any other file — a different Python file, a non-flowsheet
     * helper opened from a traceback link, etc. — are ignored so the notice
     * only ever refers to the flowsheet the Run button would actually run.
     *
     * @param document - The document VS Code just wrote to disk.
     */
    const handleDocumentSave = (document: vscode.TextDocument) => {
        const activatedFileName = context.globalState.get<string>("activatedFileName");
        if (!activatedFileName || document.fileName !== activatedFileName) {
            return;
        }
        if (!document.fileName.endsWith('.py') || !isWrappedFlowsheet(document.fileName)) {
            return;
        }
        console.log(`Active flowsheet ${document.fileName} was saved, broadcasting rerun notice`);
        brodcastMessage({
            type: 'flowsheet_file_saved',
            activate_tab_name: trimFileName(document.fileName),
            time: new Date().toISOString()
        });
    };

    vscode.workspace.onDidSaveTextDocument(handleDocumentSave, null, context.subscriptions);

    const handleActiveEditor = async (editor: vscode.TextEditor | undefined) => {
        if (editor && suppressedTabSwitch) {
            const { fsPath, expiresAt } = suppressedTabSwitch;
            if (Date.now() > expiresAt) {
                suppressedTabSwitch = null;
            } else if (editor.document.fileName === fsPath) {
                // This activation is a traceback-link jump, not the user
                // switching flowsheets — leave the tree panel untouched.
                suppressedTabSwitch = null;
                console.log(`Skipping switch_tab for traceback jump to ${fsPath}`);
                return;
            }
        }
        if (editor) {
            const currentActivateTabFileName = editor.document.fileName;
            if (currentActivateTabFileName.endsWith('.py')) {
                // update global state activateFileName to current activated file's name
                console.log("Current activate tab file name is:", currentActivateTabFileName);
                console.log(`Updating global state activated file name to ${currentActivateTabFileName}`);
                const previousActivatedFileName = context.globalState.get("activatedFileName");
                context.globalState.update("activatedFileName", currentActivateTabFileName);
                console.log('Activated file name is updated!');

                // trim file name and let it can be use by frontend app
                console.log('Get file name from activate file path');
                const activateFileName = trimFileName(currentActivateTabFileName);
                console.log(`Current activate file name is: ${activateFileName}`);

                // Update webview panel title to reflect the current file
                const webViewPanel = activateWebviews.get('webView') as vscode.WebviewPanel | undefined;
                if (webViewPanel) {
                    webViewPanel.title = `Prommis Flowsheet Inspector - ${activateFileName}`;
                }

                if (!isWrappedFlowsheet(currentActivateTabFileName)) {
                    console.log(`File ${currentActivateTabFileName} does not appear to be a flowsheet (no @FS.step("build") found), skipping fi-steps.`);
                    context.globalState.update("activatedFileName", currentActivateTabFileName);
                    brodcastMessage({
                        type: 'switch_tab',
                        activate_tab_name: activateFileName,
                        idaesRunInfo: null,
                        initError: `"${activateFileName}" is not a wrapped flowsheet file.\nFlowsheet Inspector requires @FS.step("build") to be present in the file.`,
                        // Tells the frontend this file doesn't take over the
                        // run results: e.g. clicking a traceback link opens a
                        // lib/site-packages file, which must not wipe the
                        // error log of the run being inspected.
                        is_flowsheet: false,
                        isLoading: false,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    });
                    return;
                }


                brodcastMessage(
                    {
                        type: 'switch_tab',
                        message: `Starting fetch for ${currentActivateTabFileName}`,
                        activate_tab_name: activateFileName,
                        isLoading: true,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    }
                );

                const envCheck = await checkActivePythonEnv(vscode.Uri.file(currentActivateTabFileName));
                if (!envCheck.success) {
                    brodcastMessage({
                        type: 'switch_tab',
                        activate_tab_name: activateFileName,
                        idaesRunInfo: null,
                        initError: envCheck.errorMsg,
                        packageWarnings: [],
                        isLoading: false,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // Check required packages — non-blocking; missing ones become warnings
                const resolvedEnv = await getActivePythonEnv(vscode.Uri.file(currentActivateTabFileName));
                const packageWarnings = resolvedEnv
                    ? await checkRequiredPackages(resolvedEnv)
                    : [];

                let stepsData: any;
                try {
                    stepsData = await runFiSteps(currentActivateTabFileName);
                } catch (err: any) {
                    console.error(`Error running fi-steps during tab switch: ${err.message}`);
                    stepsData = null;
                    brodcastMessage({
                        type: 'switch_tab',
                        message: `Failed to load flowsheet info for new tab: ${err.message}`,
                        activate_tab_name: activateFileName,
                        idaesRunInfo: null,
                        initError: `Failed to load flowsheet info for new tab: ${err.message}`,
                        packageWarnings,
                        isLoading: false,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    });
                    return;
                }

                // brodcast to all web app panel notice tab is switched
                console.log('Brodcast switch_tab to all web app panels');
                brodcastMessage({
                    type: 'switch_tab',
                    message: `switch tab from ${previousActivatedFileName} to ${currentActivateTabFileName}`,
                    activate_tab_name: activateFileName,
                    idaesRunInfo: stepsData,
                    initError: null,
                    packageWarnings,
                    isLoading: false,
                    open_python_files: getOpenPythonFiles(),
                    time: new Date().toISOString(),
                });
                console.log('Brodcast done.');
            } else {
                console.log(`User switched tab, but current activate tab file name is not a python file! The activated tab file is: ${currentActivateTabFileName}`);
            }
        } else {
            console.log("User switched tab, and it's not an editor tab!");
        }
    };

    vscode.window.onDidChangeActiveTextEditor(handleActiveEditor, null, context.subscriptions);

    // Re-run steps when the user switches Python interpreter, so fixing the env
    // (or any interpreter change) immediately refreshes the view — clearing a
    // stale "package not installed" warning instead of stranding the user.
    // Also push the refreshed env list so the tree view selector stays in sync.
    onDidChangeActivePythonEnv(() => {
        broadcastCurrentPythonEnv().catch((e) => console.error(`Failed to broadcast python env: ${e}`));
        handleActiveEditor(vscode.window.activeTextEditor);
    }).then((disposable) => { if (disposable) { context.subscriptions.push(disposable); } });

    // Fire immediately for the file already open when the extension first activates
    handleActiveEditor(vscode.window.activeTextEditor);
}