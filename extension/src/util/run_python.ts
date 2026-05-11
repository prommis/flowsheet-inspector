import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import { brodcastMessage } from './webview_handler';
import * as os from 'os';

type PythonExtensionApi = {
    settings?: {
        getExecutionDetails?: (resource?: vscode.Uri) => { execCommand?: string[] };
    };
};

async function getPythonExecutable(context: vscode.ExtensionContext): Promise<string> {
    const resource = vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    try {
        const pythonExtension = vscode.extensions.getExtension<PythonExtensionApi>("ms-python.python");
        const pythonApi = pythonExtension
            ? pythonExtension.isActive ? pythonExtension.exports : await pythonExtension.activate()
            : undefined;
        const execCommand = pythonApi?.settings?.getExecutionDetails?.(resource)?.execCommand;
        if (execCommand?.[0]?.trim()) {
            return execCommand[0].trim();
        }
    } catch (error) {
        console.warn(`Unable to resolve Python executable from Python extension: ${error}`);
    }

    const pythonConfig = vscode.workspace.getConfiguration("python", resource);
    return pythonConfig.get<string>("defaultInterpreterPath")?.trim()
        || pythonConfig.get<string>("pythonPath")?.trim()
        || "python";
}



/**
 * A helper function to execute a flowsheet.
 *
 * @param context - The vscode context
 * @param module - Module path or name
 * @param vscodeContextStateName - The name of the vscode context state to update
 * @returns A Promise that resolves with the status
 */
export default async function execFlowsheet(context: vscode.ExtensionContext, module: string, vscodeContextStateName: string): Promise<any> {
    const me = "runPythonModule";

    if (!context) { throw new Error(`${me}() missing VSCode extension context argument`); }
    if (!module) { throw new Error(`${me}() missing module name/path argument`); }

    const python_bin = await getPythonExecutable(context);
    console.info(`Begin ${me}: module=${module} python=${python_bin}`);

    return new Promise((resolve, reject) => {
        const python_args: string[] = ["-m", "idaes_fi.structfs.fsrunner", module];
        brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Executing ${module}` });
        cp.execFile(python_bin, python_args, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error from execFile: ${error}`);
                brodcastMessage({ type: 'terminal_log', data: `\n[ERROR] ${error}\n` });
                reject(error);
                return;
            }
            const data = {"status": 0, "stdout": stdout, "stderr": stderr};
            console.info(`End ${me}: module=${module}`);
            resolve(data);
        });
    });
}



// export default function runTerminalCommand(context: vscode.ExtensionContext, command: string, shell: string, outputFilePath: string, vscodeContextStateName: string): Promise<any> {
//     return new Promise((resolve, reject) => {
//         if (!context) { reject(new Error(`runTerminalCommand requires context as param!`)); return; }
//         if (!command) { reject(new Error(`runTerminalCommand requires command as param!`)); return; }
//         if (!shell) { reject(new Error(`runTerminalCommand requires shell as param!`)); return; }
//         if (!outputFilePath) { reject(new Error(`runTerminalCommand requires outputFilePath as param!`)); return; }

//         if (outputFilePath.startsWith('~')) {
//             outputFilePath = outputFilePath.replace(/^~/, os.homedir());
//         }

//         console.log(`
//             Starting execute terminal command:
//             ${command}
//             Terminal environment is:
//             ${shell}
//             Output file path is:
//             ${outputFilePath}
//             ...
//         `);
//         // Start execute terminal command and write to outputFilePath, then write to context.globalState.vscodeContextStateName
//         brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Executing background process via SPAWN...\nCommand: ${command}\nShell: ${shell}\n` });

//         // Delete the output file if it exists to ensure we don't read stale data from a previous run
//         try {
//             if (fs.existsSync(outputFilePath)) {
//                 fs.unlinkSync(outputFilePath);
//                 console.log(`Deleted stale output file at ${outputFilePath}`);
//             }
//         } catch (e) {
//             console.warn(`Could not delete stale output file: ${e}`);
//         }

//         const child = cp.spawn(shell, ['-c', command], {
//             detached: true,
//             env: Object.assign({}, process.env, { PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" })
//         });

//         brodcastMessage({ type: 'process_started', pid: child.pid });

//         let fullStdout = "";
//         let fullStderr = "";

//         child.stdout.on('data', (data) => {
//             fullStdout += data.toString();
//             brodcastMessage({ type: 'terminal_log', data: data.toString() });
//         });

//         child.stderr.on('data', (data) => {
//             fullStderr += data.toString();
//             brodcastMessage({ type: 'terminal_log', data: data.toString() });
//         });

//         child.on('error', (error) => {
//             console.error(`runTerminalCommand error: ${error}`);
//             brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM ERROR] Process failed to spawn: ${error}\n` });
//             reject(error);
//         });

//         child.on('close', (code, signal) => {
//             console.log(`Finished run shell command with code ${code} and signal ${signal}. Starting to read data from output file: ${outputFilePath}`);

//             if (signal === 'SIGKILL' || signal === 'SIGTERM' || signal === 'SIGINT') {
//                 brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Run flowsheet stopped manually. PID: ${child.pid}\n` });
//                 reject(new Error(`CANCELED_BY_USER:${child.pid}`));
//                 return;
//             }

//             brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Process exited with code ${code}.\nCollected stdout bytes: ${fullStdout.length}\nCollected stderr bytes: ${fullStderr.length}\n` });

//             if (code !== 0) {
//                 let errMsg = `Process failed (exit code ${code}).\n`;
//                 if (fullStderr.trim()) {
//                     errMsg += `[STDERR]:\n${fullStderr.trim()}`;
//                 } else if (fullStdout.trim()) {
//                     const lines = fullStdout.trim().split('\n');
//                     errMsg += `[ERROR TRACE]:\n${lines.slice(-15).join('\n')}`;
//                 }
//                 reject(new Error(errMsg));
//                 return;
//             }

//             let data: any;
//             try {
//                 const configContent = fs.readFileSync(outputFilePath, 'utf8');
//                 data = JSON.parse(configContent);
//             } catch (err) {
//                 console.error(`Failed to read or parse JSON from ${outputFilePath}:`, err);
//                 brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM ERROR] Failed to parse output file: ${err}\n` });
//                 reject(new Error(`Failed to read/parse output file: ${err}`));
//                 return;
//             }
//             console.log(`Finished reading data from ${outputFilePath}.`);

//                 console.log(`Now starting to write data into vscode globalState ${vscodeContextStateName}`);
//                 context.globalState.update(vscodeContextStateName, data);
//                 console.log(`Finished write into vscode globalState at ${vscodeContextStateName}`);

//                 console.log(`Start to verify if global context as same as ${outputFilePath} 's content`);
//                 const readNewGlobalStateData = context.globalState.get(vscodeContextStateName);
//                 if (JSON.stringify(data) !== JSON.stringify(readNewGlobalStateData)) {
//                     console.error(`
//                     runTerminalCommand raises error: fail to compare ${outputFilePath} 's content and vscode.globalState.${vscodeContextStateName} 's data, they are not equal!

//                     The data from ${outputFilePath} is: ${JSON.stringify(data)}
//                     The data from ${vscodeContextStateName} is: ${JSON.stringify(readNewGlobalStateData)}
//                     `);
//                     reject(new Error(`Data verification failed for ${vscodeContextStateName}`));
//                     return;
//                 }
                
//                 brodcastMessage({ type: 'terminal_log', data: `\n[SYSTEM] Execution finished successfully. JSON parsed.\n` });
//                 console.log(`Successfully update data from ${outputFilePath}, to vscode.globalState.${vscodeContextStateName}`);
//                 resolve(data);
//         });
//     });
// }
