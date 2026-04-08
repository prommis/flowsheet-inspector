// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { reloadCurrentWebview } from './util/reload_window';
import { brodcastMessage } from './util/webview_handler';
import { setDefaultConfig } from './util/setDefaultExtensionConfig';
import variableView from './varibale_view/variable_view';
import treeview from './tree_view/treeview';
import webView from './web_view/web_view';
import activateTabListener from './util/activate_tab_handler';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "idaes-extension" is now active!');

	// Override console.error to automatically broadcast all extension errors to the React frontend
	const originalConsoleError = console.error;
	console.error = (...args: any[]) => {
		originalConsoleError(...args);
		try {
			const message = args.map(a =>
				typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)
			).join(' ');

			brodcastMessage({
				type: 'error',
				message: message
			});
		} catch (e) {
			originalConsoleError('Failed to broadcast error to frontend', e);
		}
	};

	/**
	 * This command is used to setup and check the default config for the extension.
	 * It will load when extension is activated.
	 */
	setDefaultConfig(context);

	/**
	 * This command is used to listen to the tab change event.
	 * It will load when extension is activated.
	 */
	activateTabListener(context);

	// TODO:
	// add check:
	// check can't stay in registerCommand or it won't run automatically.
	// . check all required packages and packages commands if not match requirement, will show error
	// . if all requirements are met, will show information message idaes extension is started

	/*
	 * All commands has been defined in the package.json file
	 * Now provide the implementation of the command with registerCommand
	 * The commandId parameter must match the command field in package.json
	 */

	// initial extension
	/**
	 * Initial extension command
	 * This command is used to initial the extension, it will be executed when the extension is activated.
	 * 1. check all required packages and packages commands if not match requirement, will show error
	 * 2. if all requirements are met, will show information message idaes extension is started
	 */
	const initialExtensionCommand = vscode.commands.registerCommand('idaes-extension.start', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Starting idaes_extension!');
		vscode.window.showInformationMessage('idaes extension is started!');
	});

	// Register the IDAES Tree View in the sidebar
	const treeView = vscode.window.registerWebviewViewProvider(
		'idaes.treeView',
		treeview(context),
		{
			webviewOptions: { retainContextWhenHidden: true }
		}
	);

	// Register the IDAES Mermaid View in the bottom panel
	const idaesWebView = vscode.window.registerWebviewViewProvider(
		'idaes.webView',
		webView(context),
		{
			webviewOptions: { retainContextWhenHidden: true }
		}
	);

	/**
	 * Open new tab command
	 * This open new tab is like md file preview function in vscode, the open icon is shows on the 
	 * tab bar.
	 * When click the open icon it will open 2 tab window:
	 * 1. beside the current editor a text editor view show code
	 * 2. the webview window show diagram, button nasted var etc.
	 */
	const registerVariableView = vscode.commands.registerCommand(
		'idaes-extension.openVariableView',
		() => variableView(context)
	);

	/**
	 * Reload webview command
	 * This command is used for development, it will reload the webview when you change the webview code.
	 * with this command you have no need to open and close the debug mode every time you change the webview code.
	 */
	const reloadWebviewCommand = vscode.commands.registerCommand('idaes-extension.reloadWebview', () => {
		reloadCurrentWebview();
		vscode.window.showInformationMessage('🔄 Webview reloaded!');
	});


	context.subscriptions.push(initialExtensionCommand, registerVariableView, treeView, idaesWebView, reloadWebviewCommand);
}

// This method is called when your extension is deactivated
export function deactivate() { }
