import * as vscode from 'vscode';
import { brodcastMessage, activateWebviews } from './webview_handler';
import { isWrappedFlowsheet } from './validate_flowsheet';
import { trimFileName } from './trim_file_name';
import { checkActivePythonEnv } from './extension_initial_check';
import { runFiSteps } from './run_fi_steps';
import { onDidChangeActivePythonEnv, onDidChangeKnownPythonEnvs, broadcastPythonEnvUpdate } from './python_env';

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

export default function activateTabListener(context: vscode.ExtensionContext) {
    vscode.window.tabGroups.onDidChangeTabs(() => {
        const openFiles = getOpenPythonFiles();
        brodcastMessage({
            type: 'update_open_files',
            open_python_files: openFiles,
            time: new Date().toISOString()
        });
    });

    const handleActiveEditor = async (editor: vscode.TextEditor | undefined) => {
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
                        isLoading: false,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    });
                    return;
                }

                let stepsData: any;
                try {
                    stepsData = await runFiSteps(currentActivateTabFileName);
                } catch (err: any) {
                    console.error(`Error running fi-steps during tab switch: ${err.message}`);
                    stepsData = null;
                    brodcastMessage(
                        {
                            type: 'switch_tab',
                            message: `Failed to load flowsheet info for new tab: ${err.message}`,
                            activate_tab_name: activateFileName,
                            idaesRunInfo: null,
                            initError: `Failed to load flowsheet info for new tab: ${err.message}`,
                            isLoading: false,
                            open_python_files: getOpenPythonFiles(),
                            time: new Date().toISOString(),
                        }
                    );
                    return;
                }

                // brodcast to all web app panel notice tab is switched
                console.log('Brodcast switch_tab to all web app panels');
                brodcastMessage(
                    {
                        type: 'switch_tab',
                        message: `switch tab from ${previousActivatedFileName} to ${currentActivateTabFileName}`,
                        activate_tab_name: activateFileName,
                        idaesRunInfo: stepsData,
                        initError: null,
                        isLoading: false,
                        open_python_files: getOpenPythonFiles(),
                        time: new Date().toISOString(),
                    }
                );
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
        broadcastPythonEnvUpdate().catch((e) => console.error(`Failed to broadcast python envs: ${e}`));
        handleActiveEditor(vscode.window.activeTextEditor);
    }).then((disposable) => { if (disposable) { context.subscriptions.push(disposable); } });

    // Environment discovery is async and trickles in after activation — push
    // the refreshed list to the UI as environments are found (debounced,
    // since discovery fires one event per env).
    let envRefreshTimer: NodeJS.Timeout | undefined;
    onDidChangeKnownPythonEnvs(() => {
        clearTimeout(envRefreshTimer);
        envRefreshTimer = setTimeout(() => {
            broadcastPythonEnvUpdate().catch((e) => console.error(`Failed to broadcast python envs: ${e}`));
        }, 500);
    }).then((disposable) => { if (disposable) { context.subscriptions.push(disposable); } });

    // Fire immediately for the file already open when the extension first activates
    handleActiveEditor(vscode.window.activeTextEditor);
}