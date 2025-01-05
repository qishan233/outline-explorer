// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { OutlineExplorerTreeView } from './tree_view';
import * as logger from './log';



// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const treeView = new OutlineExplorerTreeView(context);

	treeView.Init();

	logger.Info('Congratulations, your extension "outline-explorer" is now active!');
}

// This method is called when your extension is deactivated
export function deactivate() {
	logger.Info("outline-explorer deactivate");

}
