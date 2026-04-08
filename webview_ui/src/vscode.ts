// VS Code API 类型
interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}
// 获取 VS Code API（只能调用一次）
function getVsCodeApi(): VsCodeApi {
    // @ts-expect-error - VS Code API is injected by the webview host, not available during build
    return acquireVsCodeApi();
}
export const vscode = getVsCodeApi();