import * as vscode from 'vscode';
import * as path from 'path';

import * as eventHandler from './listener';
import * as Logger from './log';
import { OutlineExplorerItem, OutlineExplorerFileItem, OutlineExplorerOutlineItem, Uri2OutlineExplorerItemIndex } from './item';


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
            await this.onclick(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.refresh', (element) => {
            this.refresh(element);
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
    }

    async OnRenameFiles(event: vscode.FileRenameEvent) {
        let item: OutlineExplorerItem | undefined;
        for (let file of event.files) {
            let deleteItem = this.dataProvider.removeOutlineExplorerItem(file.oldUri);
            if (deleteItem) {
                this.dataProvider.DataChanged(deleteItem.parent);
            }

            let i = await this.dataProvider.addOutlineExplorerFileItem(file.newUri);
            if (!item) {
                item = i;
            }

        }

        if (!item) {
            return;
        }

        this.dataProvider.DataChanged(item.parent);
    }

    async OnCreateFiles(event: vscode.FileCreateEvent) {
        let item: OutlineExplorerItem | undefined;
        for (let file of event.files) {
            let i = await this.dataProvider.addOutlineExplorerFileItem(file);
            if (i) {
                this.dataProvider.DataChanged(i.parent);
            }
            if (!item) {
                item = i;
            }
        }

        if (!item) {
            return;
        }

        this.revealUri(item.fileItem.uri);

    }

    OnDeleteFiles(event: vscode.FileDeleteEvent) {
        for (let file of event.files) {
            let item = this.dataProvider.removeOutlineExplorerItem(file);
            if (item) {
                this.dataProvider.DataChanged(item.parent);
            }
        }
    }

    async revealUri(uri: vscode.Uri | undefined) {
        if (!uri) {
            return;
        }

        if (!this.treeViewVisible) {
            return;
        }

        let item = await this.dataProvider.getFileItem(uri);
        if (!item) {
            return;
        }

        this.treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true
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

        let items = await this.dataProvider.getOutlineItems(e.textEditor.document.uri);
        if (!items) {
            return;
        }

        for (let item of items) {
            if (!item.outlineItem) {
                continue;
            }

            let result = item.getMatchedItemInRange(selection);
            if (result) {
                this.treeView.reveal(result);
                return;
            }
        }

    }

    async OnTextDocumentChanged(e: vscode.TextDocumentChangeEvent) {
        if (!this.treeViewVisible) {
            return;
        }

        const uri = e.document.uri;

        let item = await this.dataProvider.getFileItem(uri);
        if (!item) {
            return;
        }

        await this.dataProvider.loadOutlineItems(item);

        this.dataProvider.DataChanged(item);
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        for (let removed of event.removed) {
            this.dataProvider.removeOutlineExplorerItem(removed.uri);
        }

        this.dataProvider.DataChanged();
    }

    async OnActiveTextEditorChanged(e: vscode.TextEditor | undefined) {
        if (!e) {
            return;
        }

        if (this.ignoreActiveEditorChange) {
            this.ignoreActiveEditorChange = false;
            return;
        }


        const uri = e.document.uri;
        await this.revealUri(uri);
    }

    async onclick(item: OutlineExplorerItem) {
        if (!item) {
            return;
        }

        if (item.isOutlineItem()) {
            this.ignoreActiveEditorChange = true;
        }

        item.onClick();

        return;
    }

    async refresh(element: OutlineExplorerItem | undefined): Promise<void> {
        await this.dataProvider.refresh(element);

        if (element) {
            this.treeView.reveal(element, {
                select: true,
                focus: false,
                expand: true
            });
        }

    }

    Init() {
        setTimeout(async () => {
            let activeEditor = vscode.window.activeTextEditor;
            let workspaceFolder = vscode.workspace.workspaceFolders?.[0];

            Logger.Info('First Refresh Begin');

            await this.refresh(undefined);

            Logger.Info('First Refresh End');

            if (activeEditor) {
                await this.revealUri(activeEditor.document.uri);
            } else if (workspaceFolder) {
                await this.revealUri(workspaceFolder.uri);
            }

        }, DelayFirstRefreshTime);
    }

}

export class OutlineExplorerDataProvider implements vscode.TreeDataProvider<OutlineExplorerItem> {
    private treeDataChangedEventEmitter: vscode.EventEmitter<OutlineExplorerItem | OutlineExplorerItem[] | void | void | null | undefined> = new vscode.EventEmitter<OutlineExplorerItem[]>();
    readonly onDidChangeTreeData: vscode.Event<OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined> = this.treeDataChangedEventEmitter.event;

    private cache = new Uri2OutlineExplorerItemIndex();

    private workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();


    constructor(context: vscode.ExtensionContext) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async getOutlineItems(uri: vscode.Uri): Promise<OutlineExplorerOutlineItem[] | undefined> {
        let fileItem = this.cache.uri2FileItem.get(uri.toString());
        let outlineItems = this.cache.uri2OutlineItems.get(uri.toString());

        if (!outlineItems) {
            // create file item
            if (!fileItem) {
                let fileItems = await OutlineExplorerFileItem.loadFileItemsInPath(uri, this.cache.uri2FileItem);
                if (!fileItems || fileItems.length === 0) {
                    return;
                }

                fileItem = fileItems[fileItems.length - 1];
            }

            outlineItems = await this.loadOutlineItems(fileItem);
        }

        return outlineItems;
    }

    async getFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let item = this.cache.uri2FileItem.get(uri.toString());
        if (!item) {
            const items = await OutlineExplorerFileItem.loadFileItemsInPath(uri, this.cache.uri2FileItem);
            if (items.length === 0) {
                return;
            }

            item = items[items.length - 1];
        }

        return item;
    }

    deleteAllChildren(element: OutlineExplorerItem) {
        this.cache.uri2OutlineItems.delete(element.fileItem.uri.toString());
        this.cache.uri2FileItem.delete(element.fileItem.uri.toString());

        if (element.children) {
            for (let child of element.children) {
                this.deleteAllChildren(child);
            }
        }
    }

    async refresh(element: OutlineExplorerItem | undefined): Promise<void> {
        if (element) {
            this.deleteAllChildren(element);

            if (element.fileItem.type === vscode.FileType.Directory) {
                await this.loadOutlineItemsInDir(element);
            } else {
                await this.loadOutlineItems(element);
            }
        }


        this.DataChanged(element);
    }

    DataChanged(item: OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async addOutlineExplorerFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await OutlineExplorerFileItem.loadFileItemsInPath(uri, this.cache.uri2FileItem);

        if (items.length === 0) {
            return;
        }

        let item = items[items.length - 1];

        if (item.parent) {
            await this.loadOutlineItemsInDir(item.parent);
        }

        return item;
    }

    removeOutlineExplorerItem(uri: vscode.Uri): OutlineExplorerItem | undefined {
        let fileItem = this.cache.uri2FileItem.get(uri.toString());

        this.cache.uri2FileItem.delete(uri.toString());
        this.cache.uri2OutlineItems.delete(uri.toString());

        if (fileItem) {
            for (let child of fileItem.children ?? []) {
                if (child.isFileItem()) {
                    this.removeOutlineExplorerItem(child.fileItem.uri);
                }
            }
            let parent = fileItem.parent;
            if (parent) {
                parent.children = parent.children?.filter(item => item !== fileItem);
            }
        }

        return fileItem;
    }

    getTreeItem(element: OutlineExplorerItem): vscode.TreeItem {
        return element.getTreeItem();
    }

    async getParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        return element.getParent(this.cache);
    }

    async getChildren(element?: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element) {
            if (element.children) {
                return element.children;
            }

            if (element.isFileItem()) {
                let children = await element.getChildren(this.cache, this.getIgnoredUris(element.fileItem.uri));
                if (!children) {
                    return [];
                }

                return children;
            } else if (element.isOutlineItem()) {
                return [];
            }

            Logger.Error('getChildren Invalid OutlineExploreItem ', element);
            throw new Error('getChildren Invalid OutlineExploreItem ');
        }

        return this.loadWorkspaceFolderItems();
    }

    async loadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> {
        let items = await OutlineExplorerOutlineItem.loadOutlineItems(element, this.cache);

        return items;
    }

    getIgnoredUris(uri: vscode.Uri): vscode.Uri[] {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        let ignoredUris: vscode.Uri[] = [];
        if (workspaceFolder) {
            let i = this.workspaceFolder2IgnoreUris.get(workspaceFolder.uri.toString());
            if (i) {
                ignoredUris = i;
            }
        }

        return ignoredUris;
    }

    async loadOutlineItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        return OutlineExplorerFileItem.loadItemsInDir(element, this.getIgnoredUris(element.fileItem.uri), this.cache);
    }

    async loadWorkspaceFolderItems(): Promise<OutlineExplorerItem[]> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerItem>();
        for (let workspaceFolder of workspaceFolders) {

            let workspaceFolderItem = this.cache.uri2FileItem.get(workspaceFolder.uri.toString());
            if (workspaceFolderItem) {
                workspaceFolderItems.push(workspaceFolderItem);
                continue;
            }

            workspaceFolderItem = new OutlineExplorerFileItem(workspaceFolder.uri, vscode.FileType.Directory);

            this.cache.uri2FileItem.set(workspaceFolder.uri.toString(), workspaceFolderItem);

            await this.loadOutlineItemsInDir(workspaceFolderItem);

            workspaceFolderItems.push(workspaceFolderItem);
        }

        return workspaceFolderItems;
    }
}