// VS Code API type
interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}
// Get VS Code API (can only be called once)
function getVsCodeApi(): VsCodeApi {
    // @ts-expect-error - VS Code API is injected by the webview host, not available during build
    return acquireVsCodeApi();
}
export const vscode = getVsCodeApi();