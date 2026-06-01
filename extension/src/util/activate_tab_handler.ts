import * as vscode from 'vscode';
import * as cp from 'child_process';
import { brodcastMessage, activateWebviews } from './webview_handler';
import { isWrappedFlowsheet } from './validate_flowsheet';
import { trimFileName } from './trim_file_name';
import { readExtensionConfig } from './extensionHandler';
import { checkExtensionConfigEnv } from './extension_initial_check';
import { buildCommandChain, getSpawnArgs, getSpawnOptions } from './platform_config';

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

                const extensionConfigData = readExtensionConfig(context);
                if (!extensionConfigData) {
                    vscode.window.showErrorMessage("Config not found when switching tabs. Please set the config first.");
                    brodcastMessage(
                        {
                            type: 'switch_tab',
                            message: `switch tab from ${previousActivatedFileName} to ${currentActivateTabFileName}`,
                            activate_tab_name: activateFileName,
                            idaesRunInfo: null,
                            open_python_files: getOpenPythonFiles(),
                            time: new Date().toISOString(),
                        }
                    );
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

                const envCheck = await checkExtensionConfigEnv(extensionConfigData);
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

                const sorceCommand = extensionConfigData.sorce_treminal;
                const activateCommand = extensionConfigData.activate_command;
                const shellType = extensionConfigData.shell;

                const commandFiSteps = buildCommandChain([sorceCommand, activateCommand, `fi-steps --fs "${currentActivateTabFileName}" -t json`]);

                let stepsData: any;
                try {
                    stepsData = await new Promise<any>((resolve, reject) => {
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

    // Fire immediately for the file already open when the extension first activates
    handleActiveEditor(vscode.window.activeTextEditor);
}