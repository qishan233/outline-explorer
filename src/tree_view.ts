import * as vscode from 'vscode';
import * as path from 'path';

import * as eventHandler from './listener';
import * as Logger from './log';
import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem, Uri2OutlineExplorerItemIndex } from './item';


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
    }

    async OnRenameFiles(event: vscode.FileRenameEvent) {
        for (let file of event.files) {
            let deleteItem = this.dataProvider.RemoveOutlineExplorerItem(file.oldUri);
            if (deleteItem) {
                this.dataProvider.DataChanged(deleteItem.parent);
            }

            let i = await this.dataProvider.AddOutlineExplorerFileItem(file.newUri);
            if (i) {
                this.dataProvider.DataChanged(i.parent);
            }
        }
    }

    async OnCreateFiles(event: vscode.FileCreateEvent) {
        for (let file of event.files) {
            let i = await this.dataProvider.AddOutlineExplorerFileItem(file);
            if (i) {
                this.dataProvider.DataChanged(i.parent);
                this.RevealUri(i.fileItem.uri);
            }

        }
    }

    OnDeleteFiles(event: vscode.FileDeleteEvent) {
        for (let file of event.files) {
            let item = this.dataProvider.RemoveOutlineExplorerItem(file);
            if (item) {
                this.dataProvider.DataChanged(item.parent);
            }
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
        if (!this.treeViewVisible) {
            return;
        }

        let item = await this.dataProvider.LoadFileItem(e.document.uri);
        if (!item) {
            return;
        }

        await this.dataProvider.LoadOutlineItems(item);

        this.dataProvider.DataChanged(item);
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        // only handle the removed folders, the added folders will be handled by dataProvider.getChildren
        for (let removed of event.removed) {
            this.dataProvider.RemoveOutlineExplorerItem(removed.uri);
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
        await this.RevealUri(uri);
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

        if (element) {
            this.treeView.reveal(element, {
                select: true,
                focus: false,
                expand: true
            });
        }

    }

    Init() {
        // wait the extension that provide the outline information to be ready
        setTimeout(async () => {
            let activeEditor = vscode.window.activeTextEditor;
            let workspaceFolder = vscode.workspace.workspaceFolders?.[0];

            Logger.Info('First Refresh Begin');

            await this.Refresh(undefined);

            Logger.Info('First Refresh End');

            if (activeEditor) {
                await this.RevealUri(activeEditor.document.uri);
            } else if (workspaceFolder) {
                await this.RevealUri(workspaceFolder.uri);
            }

        }, DelayFirstRefreshTime);
    }
}

export class OutlineExplorerDataProvider implements vscode.TreeDataProvider<OutlineExplorerItem> {
    private treeDataChangedEventEmitter: vscode.EventEmitter<OutlineExplorerItem | OutlineExplorerItem[] | void | void | null | undefined> = new vscode.EventEmitter<OutlineExplorerItem[]>();
    readonly onDidChangeTreeData: vscode.Event<OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined> = this.treeDataChangedEventEmitter.event;

    private index = new Uri2OutlineExplorerItemIndex();

    private workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();


    constructor(context: vscode.ExtensionContext) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // ignore the .git folder
        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async LoadFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let item = this.index.uri2FileItem.get(uri.toString());
        if (!item) {
            const items = await OutlineExplorerFileItem.loadItemsInPath(uri, this.index.uri2FileItem);
            if (items.length === 0) {
                return;
            }

            item = items[items.length - 1];
        }

        return item;
    }

    deleteAllChildren(element: OutlineExplorerItem) {
        this.index.uri2OutlineItems.delete(element.fileItem.uri.toString());
        this.index.uri2FileItem.delete(element.fileItem.uri.toString());

        for (let child of element.children ?? []) {
            this.deleteAllChildren(child);
        }
    }

    async Refresh(element: OutlineExplorerItem | undefined): Promise<void> {
        if (element) {
            this.deleteAllChildren(element);

            if (element.fileItem.type === vscode.FileType.Directory) {
                await OutlineExplorerFileItem.LoadItemsInDir(element, this.getIgnoredUris(element.fileItem.uri), this.index);
            } else if (element.fileItem.type === vscode.FileType.File) {
                await this.LoadOutlineItems(element);
            }
        }


        this.DataChanged(element);
    }

    DataChanged(item: OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async AddOutlineExplorerFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await OutlineExplorerFileItem.loadItemsInPath(uri, this.index.uri2FileItem);

        if (items.length === 0) {
            return;
        }

        let item = items[items.length - 1];

        // update the parent's children
        if (item.parent) {
            let element = item.parent;
            await OutlineExplorerFileItem.LoadItemsInDir(element, this.getIgnoredUris(element.fileItem.uri), this.index);
        }

        return item;
    }

    RemoveOutlineExplorerItem(uri: vscode.Uri): OutlineExplorerItem | undefined {
        let fileItem = this.index.uri2FileItem.get(uri.toString());

        this.index.uri2FileItem.delete(uri.toString());
        this.index.uri2OutlineItems.delete(uri.toString());

        if (fileItem) {
            for (let child of fileItem.children ?? []) {
                if (child.GetItemType() === OutlineExplorerItemType.File) {
                    this.RemoveOutlineExplorerItem(child.fileItem.uri);
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
        return element.GetTreeItem();
    }

    async getParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        return element.GetParent(this.index);
    }

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

        let itemType = element.GetItemType();
        if (itemType === OutlineExplorerItemType.File) {
            let children = await element.GetChildren(this.index, this.getIgnoredUris(element.fileItem.uri));
            if (!children) {
                return [];
            }

            return children;
        }

        Logger.Error('getChildren Invalid OutlineExploreItem ', element);
        throw new Error('getChildren Invalid OutlineExploreItem ');
    }

    async LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> {
        let items = await OutlineExplorerOutlineItem.LoadOutlineItems(element, this.index);

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

    async loadWorkspaceFolderItems(): Promise<OutlineExplorerItem[]> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerItem>();
        for (let workspaceFolder of workspaceFolders) {

            let workspaceFolderItem = this.index.uri2FileItem.get(workspaceFolder.uri.toString());
            if (workspaceFolderItem) {
                workspaceFolderItems.push(workspaceFolderItem);
                continue;
            }

            workspaceFolderItem = new OutlineExplorerFileItem(workspaceFolder.uri, vscode.FileType.Directory);

            this.index.uri2FileItem.set(workspaceFolder.uri.toString(), workspaceFolderItem);

            await OutlineExplorerFileItem.LoadItemsInDir(workspaceFolderItem, this.getIgnoredUris(workspaceFolderItem.fileItem.uri), this.index);

            workspaceFolderItems.push(workspaceFolderItem);
        }

        return workspaceFolderItems;
    }

    async GetMatchedItemInRange(uri: vscode.Uri, selection: vscode.Selection): Promise<OutlineExplorerItem | undefined> {
        let fileItem = this.index.uri2FileItem.get(uri.toString());
        if (!fileItem) {
            return;
        }

        let items = await this.LoadOutlineItems(fileItem);
        if (!items) {
            return;
        }

        for (let item of items) {
            if (!item.outlineItem) {
                continue;
            }

            let result = item.GetMatchedItemInRange(selection);
            if (result) {
                return result;
            }
        }

        return;
    }
}