import * as vscode from 'vscode';
export default function logVscodeGlobalState(context: vscode.ExtensionContext) {
    const allKeys = context.globalState.keys();
    console.log("=== All globalState keys and values ===");
    allKeys.forEach(key => {
        console.log(`${key}:`, JSON.stringify(context.globalState.get(key)));
    });
    console.log("=== End of globalState ===");
}