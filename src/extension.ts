// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { OutlineExplorerTreeDataProvider } from './outline_explorer';

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const outlineExplorerTreeProvider = new OutlineExplorerTreeDataProvider(context);

	outputChannel = outlineExplorerTreeProvider.outputChannel;

	outputChannel.appendLine('Congratulations, your extension "outline-explorer" is now active!');
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (outputChannel) {
		outputChannel.appendLine("outline-explorer deactivate");
	} else {
		console.error("outline-explorer deactivate");
	}

}
