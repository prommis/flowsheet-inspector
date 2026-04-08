import * as vscode from 'vscode';
import { brodcastMessage } from './webview_handler';
import { trimFileName } from './trim_file_name';
import { readExtensionConfig } from './extensionHandler';
import runTerminalCommand from './run_terminal_command';
import { checkExtensionConfigEnv } from './extension_initial_check';

export default function activateTabListener(context: vscode.ExtensionContext) {
    vscode.window.onDidChangeActiveTextEditor(async editor => {
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

                const extensionConfigData = readExtensionConfig(context);
                if (!extensionConfigData) {
                    vscode.window.showErrorMessage("Config not found when switching tabs. Please set the config first.");
                    brodcastMessage(
                        {
                            type: 'switch_tab',
                            message: `switch tab from ${previousActivatedFileName} to ${currentActivateTabFileName}`,
                            activate_tab_name: activateFileName,
                            idaesRunInfo: null,
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
                        time: new Date().toISOString(),
                    });
                    return;
                }

                const sorceCommand = extensionConfigData.sorce_treminal;
                const activateCommand = extensionConfigData.activate_command;
                const outputFileName = extensionConfigData.output_file_name;
                const shellType = "/bin/zsh";

                const commandIdaesRunInfo = `${sorceCommand} && ${activateCommand} && idaes-run "${currentActivateTabFileName}" "${outputFileName}" --info`;
                
                let stepsData: any;
                try {
                    stepsData = await runTerminalCommand(context, commandIdaesRunInfo, shellType, outputFileName, "currentFileInfo");
                } catch (err: any) {
                    console.error(`Error running terminal command during tab switch: ${err.message}`);
                    stepsData = null;
                    brodcastMessage(
                        {
                            type: 'switch_tab',
                            message: `Failed to load flowsheet info for new tab: ${err.message}`,
                            activate_tab_name: activateFileName,
                            idaesRunInfo: null,
                            initError: `Failed to load flowsheet info for new tab: ${err.message}`,
                            isLoading: false,
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
    });
}