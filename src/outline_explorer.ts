import * as vscode from 'vscode';
import * as path from 'path';

import { GetDocumentSymbols, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileItemsInPath, getFileItemsInDir } from './file';
import * as eventHandler from './listener';
import * as Logger from './log';


class uri2OutlineExplorerItemIndex {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
}

interface OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    getChildren(index: uri2OutlineExplorerItemIndex, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined>;
    getParent(index: uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined>;
    getTreeItem(): vscode.TreeItem;

    isFileItem(): boolean;
    isOutlineItem(): boolean;

    onClick(): void;
}

class OutlineExplorerFileItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(fileItem: FileItem) {
        this.fileItem = fileItem;
    }

    isFileItem(): boolean {
        return true;
    }

    isOutlineItem(): boolean {
        return false;
    }

    onClick() {
        // do nothing
    }

    getTreeItem(): vscode.TreeItem {
        return this.treeItemFactory.FromOutlineExplorerFileItem(this);
    }

    async getChildren(index: uri2OutlineExplorerItemIndex, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined> {
        let children: OutlineExplorerItem[] | undefined = undefined;
        if (this.fileItem.type === vscode.FileType.Directory) {
            children = await OutlineExplorerFileItem.loadItemsInDir(this, ignoredUri, index);
        } else {
            children = await OutlineExplorerOutlineItem.loadOutlineItems(this, index);
        }

        this.children = children;

        return this.children;
    }

    async getParent(index: uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined> {
        const uri = this.fileItem.uri;
        let fileItems = await OutlineExplorerFileItem.loadFileItemsInPath(uri, index.uri2FileItem);
        if (!fileItems || fileItems.length === 0) {
            this.parent = undefined;
        } else {
            fileItems[fileItems.length - 1].parent;
        }

        return this.parent;
    }

    static async loadItemsInDir(element: OutlineExplorerItem, ignoredUris: vscode.Uri[], index: uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem[]> {
        let uri = element.fileItem.uri;

        let fileItems = await getFileItemsInDir(uri, ignoredUris);

        const outlineExplorerFileItems = fileItems.map(fileItem => {
            let item = index.uri2FileItem.get(fileItem.uri.toString());

            if (!item) {
                item = new OutlineExplorerFileItem(fileItem);
            }

            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerFileItems) {
            index.uri2FileItem.set(item.fileItem.uri.toString(), item);
        }

        element.children = outlineExplorerFileItems;

        return outlineExplorerFileItems;
    }

    // create file items of uri and it's parents, if uri is out of workspaces, return empty
    static async loadFileItemsInPath(uri: vscode.Uri, uri2OutlineExplorerFileItem: Map<string, OutlineExplorerFileItem>): Promise<OutlineExplorerFileItem[]> {
        let fileItemsInPath = await getFileItemsInPath(uri);
        if (!fileItemsInPath) {
            return [];
        }

        let outlineExplorerFileItems: OutlineExplorerFileItem[] = [];
        for (let i = 0; i < fileItemsInPath.length; i++) {
            const fileItem = fileItemsInPath[i];

            let existFileItem = uri2OutlineExplorerFileItem.get(fileItem.uri.toString());
            if (existFileItem) {
                outlineExplorerFileItems.push(existFileItem);
                continue;
            }

            let item = new OutlineExplorerFileItem(fileItem);
            item.parent = i === 0 ? undefined : outlineExplorerFileItems[i - 1];

            outlineExplorerFileItems.push(item);
        }

        for (let item of outlineExplorerFileItems) {
            uri2OutlineExplorerFileItem.set(item.fileItem.uri.toString(), item);
        }

        return outlineExplorerFileItems;
    }

}

class OutlineExplorerOutlineItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerOutlineItem[] | undefined;

    outlineItem: OutlineItem;

    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(fileItem: FileItem, parent: OutlineExplorerItem | undefined, documentSymbol: vscode.DocumentSymbol) {
        this.fileItem = fileItem;
        this.parent = parent;
        this.outlineItem = { documentSymbol };

        if (documentSymbol.children.length > 0) {
            this.children = [];
            let p: OutlineExplorerOutlineItem = this;
            for (let child of documentSymbol.children) {
                let c = new OutlineExplorerOutlineItem(fileItem, p, child);
                this.children.push(c);
                p = c;
            }
        }
    }

    isFileItem(): boolean {
        return false;
    }

    isOutlineItem(): boolean {
        return true;
    }

    async onClick() {
        const documentSymbol = this.outlineItem.documentSymbol;
        const selection = new vscode.Selection(documentSymbol.selectionRange.start, documentSymbol.selectionRange.start);

        let targetEditor = vscode.window.activeTextEditor;
        let document = targetEditor?.document;

        let uri = this.fileItem.uri;

        if (!document || document.uri.toString() !== uri.toString()) {
            document = await vscode.workspace.openTextDocument(uri.path);
        }

        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, selection: selection });
    }

    getTreeItem(): vscode.TreeItem {
        return this.treeItemFactory.FromOutlineExplorerOutlineItem(this);
    }

    async getChildren(): Promise<OutlineExplorerItem[] | undefined> {
        return this.children;
    }

    async getParent(index: uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined> {
        const targetOutlineItem = this.outlineItem;
        let outlineExplorerItems = index.uri2OutlineItems.get(this.fileItem.uri.toString());

        if (!outlineExplorerItems) {
            outlineExplorerItems = await OutlineExplorerOutlineItem.loadOutlineItems(this, index);
        }

        const outlineItems = outlineExplorerItems.map(item => item.outlineItem).filter(item => item !== undefined);

        const parents = getParentsOfDocumentSymbol(outlineItems, targetOutlineItem.documentSymbol);
        if (!parents) {
            return undefined;
        }

        if (parents.length === 0) {
            let fileItems = await OutlineExplorerFileItem.loadFileItemsInPath(this.fileItem.uri, index.uri2FileItem);
            if (fileItems.length === 0) {
                return undefined;
            }

            return fileItems[fileItems.length - 1];
        } else {
            const parentOutlineItem = parents[parents.length - 1];
            const parentItem = outlineExplorerItems.find(item => {
                if (!item.outlineItem) {
                    return false;
                }
                return item.outlineItem === parentOutlineItem;
            });

            if (parentItem) {
                return parentItem;
            }
            return undefined;
        }
    }

    getMatchedItemInRange(range: vscode.Range): OutlineExplorerItem | undefined {
        let documentSymbol = this.outlineItem.documentSymbol;

        // it is not in the range of the documentSymbol
        if (!documentSymbol.range.contains(range)) {
            return undefined;
        }

        // equals has the highest priority
        if (documentSymbol.selectionRange.isEqual(range)) {
            return this;
        }

        // if it has no children and contains the range, return it
        if (!this.children) {
            if (documentSymbol.selectionRange.contains(range)) {
                return this;
            }

            return undefined;
        }

        // then children first
        for (let child of this.children) {
            let result = child.getMatchedItemInRange(range);
            if (result) {
                return result;
            }
        }

        // if it contains the range, return
        if (documentSymbol.selectionRange.contains(range)) {
            return this;
        }

        return undefined;
    }

    static async loadOutlineItems(element: OutlineExplorerItem, index: uri2OutlineExplorerItemIndex): Promise<OutlineExplorerOutlineItem[]> {
        if (element.fileItem.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileItem.uri;
        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineExplorerOutlineItem(element.fileItem, element, documentSymbol);
        });

        element.children = items;

        index.uri2OutlineItems.set(element.fileItem.uri.toString(), items);

        return items;
    }

}


interface TreeItemFactory {
    FromOutlineExplorerFileItem(element: OutlineExplorerFileItem): vscode.TreeItem;
    FromOutlineExplorerOutlineItem(element: OutlineExplorerOutlineItem): vscode.TreeItem;
}

function NewTreeItemFactory(): TreeItemFactory {
    return new TreeItemFactoryImpl();
}


class TreeItemFactoryImpl implements TreeItemFactory {
    FromOutlineExplorerFileItem(element: OutlineExplorerFileItem): vscode.TreeItem {
        if (!element.fileItem) {
            Logger.Error('createFileItem TreeItem Invalid OutlineExploreItem ');
            throw new Error('createFileItem TreeItem Invalid OutlineExploreItem ');
        }

        let fileItem = element.fileItem;

        const treeItem = new vscode.TreeItem(fileItem.uri);
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

        if (fileItem.type === vscode.FileType.File) {
            treeItem.iconPath = vscode.ThemeIcon.File;
            treeItem.command = { command: 'vscode.open', title: 'Open File', arguments: [fileItem.uri] };
        } else {
            treeItem.iconPath = vscode.ThemeIcon.Folder;
        }

        treeItem.contextValue = fileItem.type === vscode.FileType.File ? 'file' : 'folder';

        return treeItem;
    }

    FromOutlineExplorerOutlineItem(element: OutlineExplorerOutlineItem): vscode.TreeItem {
        if (!element.outlineItem || !element.outlineItem.documentSymbol) {
            Logger.Error('createOutlineItem TreeItem Invalid OutlineExploreItem ', element);
            throw new Error('createOutlineItem TreeItem Invalid OutlineExploreItem ');
        }

        let documentSymbol = element.outlineItem.documentSymbol;

        const treeItem = new vscode.TreeItem(documentSymbol.name);
        if (documentSymbol.children?.length > 0) {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        treeItem.iconPath = new vscode.ThemeIcon(SymbolKind2IconId.get(documentSymbol.kind) || 'symbol-property');
        treeItem.description = documentSymbol.detail;
        treeItem.command = {
            command: 'outline-explorer.item-clicked',
            title: 'Click Item',
            arguments: [element]
        };

        treeItem.contextValue = 'outline';

        return treeItem;
    }
}

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

        this.ignoreActiveEditorChange = true;

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

    private cache = new uri2OutlineExplorerItemIndex();

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

            workspaceFolderItem = new OutlineExplorerFileItem(new FileItem(workspaceFolder.uri, vscode.FileType.Directory));

            this.cache.uri2FileItem.set(workspaceFolder.uri.toString(), workspaceFolderItem);

            await this.loadOutlineItemsInDir(workspaceFolderItem);

            workspaceFolderItems.push(workspaceFolderItem);
        }

        return workspaceFolderItems;
    }
}