import * as vscode from 'vscode';
import * as path from 'path';

import * as eventHandler from './listener';
import * as Logger from './log';
import { Item, ItemType } from './item';
import { OutlineExplorerDataProvider } from './item_data_provider';


const DelayFirstRefreshTime = 2000;

export class OutlineExplorerTreeView {
    private treeView: vscode.TreeView<Item>;
    private dataProvider: OutlineExplorerDataProvider;

    private treeViewVisible = false;
    private ignoreActiveEditorChange = false;

    constructor(context: vscode.ExtensionContext) {

        this.dataProvider = new OutlineExplorerDataProvider(context);
        this.treeView = vscode.window.createTreeView('outline-explorer', { treeDataProvider: this.dataProvider });

        // 注册插件相关组件
        context.subscriptions.push(this.treeView);
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.item-clicked', async (item) => {
            await this.OnClick(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.refresh', (element) => {
            this.Refresh(element);
        }, this));

        // 注册树视图事件处理程序
        this.treeView.onDidChangeVisibility(e => this.OnVisibilityChanged(e));

        // 注册事件处理程序
        const eventHandlerManager = eventHandler.GlobalVSCodeEventHandlerManager;

        eventHandlerManager.RegisterTextDocumentChangedEventHandler(this);
        eventHandlerManager.RegisterActiveTextEditorChangedEventHandler(this);
        eventHandlerManager.RegisterTextEditorSelectionChangedEventHandler(this);
        eventHandlerManager.RegisterWorkspaceFoldersChangedEventHandler(this);
        eventHandlerManager.RegisterRenameFilesEventHandler(this);
        eventHandlerManager.RegisterCreateFilesEventHandler(this);
        eventHandlerManager.RegisterDeleteFilesEventHandler(this);

    }

    OnVisibilityChanged(e: vscode.TreeViewVisibilityChangeEvent) {
        this.treeViewVisible = e.visible;
        if (this.treeViewVisible) {
            this.revealActiveTextEditor();
        }
    }

    async OnRenameFiles(event: vscode.FileRenameEvent) {
        for (let file of event.files) {
            this.dataProvider.RemoveItem(file.oldUri);

            await this.dataProvider.AddOutlineExplorerFileItem(file.newUri);
        }
    }

    async OnCreateFiles(event: vscode.FileCreateEvent) {
        for (let file of event.files) {
            await this.dataProvider.AddOutlineExplorerFileItem(file);
        }
    }

    OnDeleteFiles(event: vscode.FileDeleteEvent) {
        for (let file of event.files) {
            this.dataProvider.RemoveItem(file);
        }
    }

    async RevealUri(uri: vscode.Uri) {
        if (!this.treeViewVisible) {
            return;
        }

        let item = await this.dataProvider.LoadFileItem(uri);
        if (!item) {
            return;
        }

        this.treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true,
        });
    }


    async OnTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {
        if (!this.treeViewVisible) {
            return;
        }

        if (!e.kind) {
            return;
        }

        const selection = e.selections[0];
        if (selection.isEmpty) {
            return;
        }

        let item = await this.dataProvider.GetMatchedItemInRange(e.textEditor.document.uri, selection);
        if (!item) {
            return;
        }

        this.treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true
        });
    }

    async OnTextDocumentChanged(e: vscode.TextDocumentChangeEvent) {
        await this.dataProvider.LoadOutlineItemsOfUri(e.document.uri);
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        // only handle the removed folders, the added folders will be handled by dataProvider.getChildren
        for (let removed of event.removed) {
            this.dataProvider.RemoveItem(removed.uri);
        }
    }

    async OnActiveTextEditorChanged(e: vscode.TextEditor | undefined) {
        if (!e) {
            return;
        }

        if (this.ignoreActiveEditorChange) {
            this.ignoreActiveEditorChange = false;
            return;
        }

        await this.RevealUri(e.document.uri);
    }

    async OnClick(item: Item) {
        if (!item) {
            return;
        }

        // outlineItem.onClick() may change the active editor, at this time, the global event handler won't need to handle the active editor change event
        if (item.GetItemType() === ItemType.Outline) {
            this.ignoreActiveEditorChange = true;
        }

        item.OnClick();

        return;
    }

    async Refresh(element: Item | undefined): Promise<void> {
        await this.dataProvider.Refresh(element);

        if (!element) {
            return;
        }

        this.treeView.reveal(element, {
            select: true,
            focus: false,
            expand: true
        });
    }

    Init() {
        // wait the extension that provide the outline information to be ready
        setTimeout(async () => {
            Logger.Info('First Refresh Begin');

            await this.Refresh(undefined);

            Logger.Info('First Refresh End');

            await this.revealActiveTextEditor();

        }, DelayFirstRefreshTime);
    }

    async revealActiveTextEditor() {
        let activeEditor = vscode.window.activeTextEditor;
        let workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (activeEditor) {
            await this.RevealUri(activeEditor.document.uri);
        } else if (workspaceFolder) {
            await this.RevealUri(workspaceFolder.uri);
        }
    }
}
