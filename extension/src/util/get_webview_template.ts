import * as vscode from 'vscode';
import * as fs from 'fs';

export function getReactTemplate(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    fileName: string,
    content: string
): string {
    // Path to the React build output — use extensionUri + joinPath (works under Snap/Flatpak/remote)
    const webviewNewUri = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview_template', 'webview_new');
    const htmlPath = webviewNewUri.fsPath + '/index.html';

    // Convert local file paths to webview URIs
    const assetsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewNewUri, 'assets'));

    // Read HTML content
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // Replace relative asset paths with webview URIs
    // Vite builds with base: './' will output paths like ./assets/...
    htmlContent = htmlContent.replace(/\.\/assets\//g, `${assetsUri}/`);

    // Also handle /assets/ paths just in case
    htmlContent = htmlContent.replace(/\/assets\//g, `${assetsUri}/`);

    return htmlContent;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}