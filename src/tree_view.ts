import * as vscode from 'vscode';
import * as path from 'path';

import * as eventHandler from './listener';
import * as Logger from './log';
import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem } from './item';
import { ItemManagerFactory } from './item_manager';

const DelayFirstRefreshTime = 2000;

export class OutlineExplorerTreeView extends eventHandler.BaseVSCodeEventHandler {
    private treeView: vscode.TreeView<OutlineExplorerItem>;
    private dataProvider: OutlineExplorerDataProvider;

    private treeViewVisible = false;
    private ignoreActiveEditorChange = false;

    constructor(context: vscode.ExtensionContext) {
        super();

        this.dataProvider = new OutlineExplorerDataProvider(context);

        this.treeView = vscode.window.createTreeView('outline-explorer', { treeDataProvider: this.dataProvider });

        context.subscriptions.push(this.treeView);

        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.item-clicked', async (item) => {
            await this.OnClick(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.refresh', (element) => {
            this.Refresh(element);
        }, this));

        this.treeView.onDidChangeVisibility(e => this.OnVisibilityChanged(e));

        const eventHandlerManager = new eventHandler.VSCodeEventHandlerManager();

        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.TextDocumentChanged, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.ActiveTextEditorChanged, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.TextEditorSelectionChanged, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.WorkspaceFoldersChanged, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.RenameFiles, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.CreateFiles, this);
        eventHandlerManager.RegisterEventHandler(eventHandler.VSCodeEvent.DeleteFiles, this);

    }

    OnVisibilityChanged(e: vscode.TreeViewVisibilityChangeEvent) {
        this.treeViewVisible = e.visible;
        if (this.treeViewVisible) {
            this.revealActiveTextEditor();
        }
    }

    async OnRenameFiles(event: vscode.FileRenameEvent) {
        for (let file of event.files) {
            this.dataProvider.RemoveOutlineExplorerItem(file.oldUri);

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
            this.dataProvider.RemoveOutlineExplorerItem(file);
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
            this.dataProvider.RemoveOutlineExplorerItem(removed.uri);
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

    async OnClick(item: OutlineExplorerItem) {
        if (!item) {
            return;
        }

        // outlineItem.onClick() may change the active editor, at this time, the global event handler won't need to handle the active editor change event
        if (item.GetItemType() === OutlineExplorerItemType.Outline) {
            this.ignoreActiveEditorChange = true;
        }

        item.OnClick();

        return;
    }

    async Refresh(element: OutlineExplorerItem | undefined): Promise<void> {
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

export class OutlineExplorerDataProvider implements vscode.TreeDataProvider<OutlineExplorerItem> {
    private treeDataChangedEventEmitter: vscode.EventEmitter<OutlineExplorerItem | OutlineExplorerItem[] | void | void | null | undefined> = new vscode.EventEmitter<OutlineExplorerItem[]>();
    readonly onDidChangeTreeData: vscode.Event<OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined> = this.treeDataChangedEventEmitter.event;

    private itemManager = ItemManagerFactory.Create();

    constructor(context: vscode.ExtensionContext) { }

    async LoadFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        return this.itemManager.LoadFileItem(uri);
    }

    async Refresh(element: OutlineExplorerItem | undefined): Promise<void> {
        if (!element) {
            this.dataChanged(element);
            return;
        }

        this.itemManager.DeleteItem(element);

        // TODO use strategy pattern to handle different types of OutlineExplorerItem
        if (element.fileItem.type === vscode.FileType.Directory) {
            await this.itemManager.LoadItemsInDir(element);
        } else if (element.fileItem.type === vscode.FileType.File) {
            await this.itemManager.LoadOutlineItems(element);
        }

        this.dataChanged(element);
    }

    private dataChanged(item: OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async AddOutlineExplorerFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await this.itemManager.LoadItemsInPath(uri);

        if (items.length === 0) {
            return;
        }

        let item = items[items.length - 1];

        // update the parent's children
        if (item.parent) {
            await this.itemManager.LoadItemsInDir(item.parent);
        }

        this.dataChanged(item.parent);

        return item;
    }

    RemoveOutlineExplorerItem(uri: vscode.Uri): OutlineExplorerItem | undefined {
        let fileItem = this.itemManager.GetFileItem(uri);

        this.itemManager.DeleteItemByUri(uri);

        if (!fileItem) {
            return;
        }

        for (let child of fileItem.children ?? []) {
            if (child.GetItemType() === OutlineExplorerItemType.File) {
                this.RemoveOutlineExplorerItem(child.fileItem.uri);
            }
        }

        let parent = fileItem.parent;
        if (parent) {
            parent.children = parent.children?.filter(item => item !== fileItem);
        }

        this.dataChanged(parent);

        return fileItem;
    }

    // vscode.TreeDataProvider implementation
    getTreeItem(element: OutlineExplorerItem): vscode.TreeItem {
        return element.GetTreeItem();
    }

    // vscode.TreeDataProvider implementation
    async getParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        return this.itemManager.LoadParentItem(element);
    }

    // vscode.TreeDataProvider implementation
    async getChildren(element?: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element) {
            return this.getChildrenOfElement(element);
        }

        return this.loadWorkspaceFolderItems();
    }

    async getChildrenOfElement(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element.children) {
            return element.children;
        }

        if (element.GetItemType() === OutlineExplorerItemType.Outline) {
            return [];
        }

        if (element.GetItemType() !== OutlineExplorerItemType.File) {
            Logger.Error('getChildren Invalid OutlineExploreItem', element);
            throw new Error('getChildren Invalid OutlineExploreItem');
        }

        let children: OutlineExplorerItem[] | undefined = undefined;

        // TODO duplicate code with Refresh
        if (element.fileItem.type === vscode.FileType.Directory) {
            children = await this.itemManager.LoadItemsInDir(element);
        } else {
            children = await this.itemManager.LoadOutlineItems(element);
        }

        element.children = children;

        return children;
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        let items = await this.itemManager.LoadOutlineItemsOfUri(uri);
        if (!items || items.length === 0) {
            return;
        }

        let parent = items[0].parent;
        this.dataChanged(parent);

        return items;
    }

    private async loadWorkspaceFolderItems(): Promise<OutlineExplorerItem[]> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerItem>();
        for (let workspaceFolder of workspaceFolders) {
            let workspaceFolderItem = this.itemManager.GetFileItem(workspaceFolder.uri);
            if (workspaceFolderItem) {
                workspaceFolderItems.push(workspaceFolderItem);
                continue;
            }

            workspaceFolderItem = new OutlineExplorerFileItem(workspaceFolder.uri, vscode.FileType.Directory);

            this.itemManager.SetFileItem(workspaceFolder.uri, workspaceFolderItem);

            await this.itemManager.LoadItemsInDir(workspaceFolderItem);

            workspaceFolderItems.push(workspaceFolderItem);
        }

        return workspaceFolderItems;
    }

    async GetMatchedItemInRange(uri: vscode.Uri, selection: vscode.Selection): Promise<OutlineExplorerItem | undefined> {
        let fileItem = this.itemManager.GetFileItem(uri);
        if (!fileItem) {
            return;
        }

        let items = await this.itemManager.LoadOutlineItems(fileItem);
        if (!items) {
            return;
        }

        for (let item of items) {
            let result = item.GetMatchedItemInRange(selection);
            if (result) {
                return result;
            }
        }

        return;
    }
}