import * as vscode from 'vscode';
import * as path from 'path';

import { GetOutline, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileEntriesInPath, getFileEntriesInDir, isInWorkspace, isFile } from './file';
import * as eventHandler from './listener';
import * as Logger from './log';


function GetMatchedEntryOfRange(entry: OutlineExplorerOutlineItem, range: vscode.Range): OutlineExplorerItem | undefined {
    if (!entry.outlineItem) {
        return undefined;
    }

    let documentSymbol = entry.outlineItem.documentSymbol;

    // it is not in the range of the documentSymbol
    if (!documentSymbol.range.contains(range)) {
        return undefined;
    }

    // equals has the highest priority
    if (documentSymbol.selectionRange.isEqual(range)) {
        return entry;
    }

    // if it has no children and contains the range, return it
    if (!entry.children) {
        if (documentSymbol.selectionRange.contains(range)) {
            return entry;
        }

        return undefined;
    }

    // then children first
    for (let child of entry.children) {
        let result = GetMatchedEntryOfRange(child, range);
        if (result) {
            return result;
        }
    }

    // if it contains the range, return
    if (documentSymbol.selectionRange.contains(range)) {
        return entry;
    }

    return undefined;
}

enum OutlineExplorerItemType {
    Default = 0,
    File,
    Outline,
}

class uri2OutlineExplorerItemCache {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
}

interface OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    isFileEntry(): boolean;
    isOutlineEntry(): boolean;
    onClick(): void;
    getTreeItem(): vscode.TreeItem;
    getChildren(cache: uri2OutlineExplorerItemCache, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined>;
    getParent(cache: uri2OutlineExplorerItemCache): Promise<OutlineExplorerItem | undefined>;
}

class OutlineExplorerFileItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    constructor(fileItem: FileItem) {
        this.fileItem = fileItem;
    }

    isFileEntry(): boolean {
        return true;
    }

    isOutlineEntry(): boolean {
        return false;
    }

    onClick() {
        // do nothing
    }

    getTreeItem(): vscode.TreeItem {
        return createFileEntryTreeItem(this);
    }

    async getChildren(cache: uri2OutlineExplorerItemCache, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined> {
        let children: OutlineExplorerItem[] | undefined = undefined;
        if (this.fileItem.type === vscode.FileType.Directory) {
            children = await OutlineExplorerFileItem.loadOutlineEntriesInDir(this, ignoredUri, cache);
        } else {
            children = await OutlineExplorerOutlineItem.loadOutlineEntries(this, cache);
        }

        this.children = children;

        return this.children;
    }

    async getParent(cache: uri2OutlineExplorerItemCache): Promise<OutlineExplorerItem | undefined> {
        const uri = this.fileItem.uri;
        let fileEntries = await getOrCreateFileEntriesInPath(uri, cache.uri2FileItem);
        if (!fileEntries || fileEntries.length === 0) {
            this.parent = undefined;
        } else {
            fileEntries[fileEntries.length - 1].parent;
        }

        return this.parent;
    }

    static async loadOutlineEntriesInDir(element: OutlineExplorerItem, ignoredUris: vscode.Uri[], cache: uri2OutlineExplorerItemCache): Promise<OutlineExplorerItem[]> {
        let uri = element.fileItem.uri;

        let fileEntries = await getFileEntriesInDir(uri, ignoredUris);

        const outlineExplorerEntries = fileEntries.map(fileEntry => {
            let item = cache.uri2FileItem.get(fileEntry.uri.toString());

            if (!item) {
                item = new OutlineExplorerFileItem(fileEntry);
            }

            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerEntries) {
            cache.uri2FileItem.set(item.fileItem.uri.toString(), item);
        }

        element.children = outlineExplorerEntries;

        return outlineExplorerEntries;
    }

}

class OutlineExplorerOutlineItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerOutlineItem[] | undefined;

    outlineItem: OutlineItem;

    constructor(fileItem: FileItem, parent: OutlineExplorerItem | undefined, outlineItem: OutlineItem) {
        this.fileItem = fileItem;
        this.parent = parent;
        this.outlineItem = outlineItem;
    }

    isFileEntry(): boolean {
        return false;
    }

    isOutlineEntry(): boolean {
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
        return createOutlineEntryTreeItem(this);
    }

    async getChildren(): Promise<OutlineExplorerItem[] | undefined> {
        return this.children;
    }

    async getParent(cache: uri2OutlineExplorerItemCache): Promise<OutlineExplorerItem | undefined> {
        const targetOutlineEntry = this.outlineItem;
        let outlineExplorerItems = cache.uri2OutlineItems.get(this.fileItem.uri.toString());

        if (!outlineExplorerItems) {
            outlineExplorerItems = await OutlineExplorerOutlineItem.loadOutlineEntries(this, cache);
        }

        const outlineEntries = outlineExplorerItems.map(item => item.outlineItem).filter(entry => entry !== undefined);

        const parents = getParentsOfDocumentSymbol(outlineEntries, targetOutlineEntry.documentSymbol);
        if (!parents) {
            return undefined;
        }

        if (parents.length === 0) {
            let fileEntries = await getOrCreateFileEntriesInPath(this.fileItem.uri, cache.uri2FileItem);
            if (fileEntries.length === 0) {
                return undefined;
            }

            return fileEntries[fileEntries.length - 1];
        } else {
            const parentOutlineEntry = parents[parents.length - 1];
            const parentEntry = outlineExplorerItems.find(item => {
                if (!item.outlineItem) {
                    return false;
                }
                return item.outlineItem === parentOutlineEntry;
            });

            if (parentEntry) {
                return parentEntry;
            }
            return undefined;
        }
    }

    static async loadOutlineEntries(element: OutlineExplorerItem, cache: uri2OutlineExplorerItemCache): Promise<OutlineExplorerOutlineItem[]> {
        if (element.fileItem.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileItem.uri;
        const outlineItems = await GetOutline(uri);
        let entries = outlineItems.map(documentSymbol => {
            return OutlineExplorerOutlineItem.documentSymbol2OutlineEntry(documentSymbol, element);
        });

        element.children = entries;

        cache.uri2OutlineItems.set(element.fileItem.uri.toString(), entries);

        return entries;
    }

    static documentSymbol2OutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerItem): OutlineExplorerOutlineItem {
        const result = OutlineExplorerOutlineItemFactory.NewByDocumentSymbol(documentSymbol, parent);

        if (documentSymbol.children.length > 0) {
            result.children = [];
            let p = result;
            for (let child of documentSymbol.children) {
                let childEntry = OutlineExplorerOutlineItem.documentSymbol2OutlineEntry(child, p);
                result.children.push(childEntry);
                p = childEntry;
            }
        }

        return result;
    }
}

class OutlineExplorerOutlineItemFactory {
    static NewByDocumentSymbol(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerItem): OutlineExplorerOutlineItem {
        let outlineItem = { documentSymbol };

        let item = new OutlineExplorerOutlineItem(parent.fileItem, parent, outlineItem);

        return item;
    }
}


// create file entries of uri and it's parents, if uri is out of workspaces, return empty
async function getOrCreateFileEntriesInPath(uri: vscode.Uri, uri2OutlineExplorerFileItem: Map<string, OutlineExplorerFileItem>): Promise<OutlineExplorerItem[]> {
    let fileEntriesInPath = await getFileEntriesInPath(uri);
    if (!fileEntriesInPath) {
        return [];
    }

    let fileOutlineExplorerEntries: OutlineExplorerItem[] = [];
    for (let i = 0; i < fileEntriesInPath.length; i++) {
        const fileEntry = fileEntriesInPath[i];

        let existFileEntry = uri2OutlineExplorerFileItem.get(fileEntry.uri.toString());
        if (existFileEntry) {
            fileOutlineExplorerEntries.push(existFileEntry);
            continue;
        }

        let item = new OutlineExplorerFileItem(fileEntry);
        item.parent = i === 0 ? undefined : fileOutlineExplorerEntries[i - 1];

        fileOutlineExplorerEntries.push(item);
    }

    for (let item of fileOutlineExplorerEntries) {
        uri2OutlineExplorerFileItem.set(item.fileItem.uri.toString(), item);
    }

    return fileOutlineExplorerEntries;
}


function createFileEntryTreeItem(element: OutlineExplorerFileItem): vscode.TreeItem {
    if (!element.fileItem) {
        Logger.Error('createFileEntryTreeItem Invalid OutlineExploreEntry');
        throw new Error('createFileEntryTreeItem Invalid OutlineExploreEntry');
    }

    let fileEntry = element.fileItem;

    const treeItem = new vscode.TreeItem(fileEntry.uri);
    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    if (fileEntry.type === vscode.FileType.File) {
        treeItem.iconPath = vscode.ThemeIcon.File;
        treeItem.command = { command: 'vscode.open', title: 'Open File', arguments: [fileEntry.uri] };
    } else {
        treeItem.iconPath = vscode.ThemeIcon.Folder;
    }

    treeItem.contextValue = fileEntry.type === vscode.FileType.File ? 'file' : 'folder';

    return treeItem;
}

function createOutlineEntryTreeItem(element: OutlineExplorerOutlineItem): vscode.TreeItem {
    if (!element.outlineItem || !element.outlineItem.documentSymbol) {
        Logger.Error('createOutlineEntryTreeItem Invalid OutlineExploreEntry', element);
        throw new Error('createOutlineEntryTreeItem Invalid OutlineExploreEntry');
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

        let entry = await this.dataProvider.getFileItem(uri);
        if (!entry) {
            return;
        }

        this.treeView.reveal(entry, {
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

        let outlineEntries = await this.dataProvider.getOutlineItems(e.textEditor.document.uri);
        if (!outlineEntries) {
            return;
        }

        for (let outlineEntry of outlineEntries) {
            if (!outlineEntry.outlineItem) {
                continue;
            }

            let result = GetMatchedEntryOfRange(outlineEntry, selection);
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

        let entry = await this.dataProvider.getFileItem(uri);
        if (!entry) {
            return;
        }

        await this.dataProvider.loadOutlineEntries(entry);

        this.dataProvider.DataChanged(entry);
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

    private cache = new uri2OutlineExplorerItemCache();

    private workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();


    constructor(context: vscode.ExtensionContext) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async getOutlineItems(uri: vscode.Uri): Promise<OutlineExplorerOutlineItem[] | undefined> {
        let fileEntry = this.cache.uri2FileItem.get(uri.toString());
        let outlineEntries = this.cache.uri2OutlineItems.get(uri.toString());

        if (!outlineEntries) {
            // create file entry
            if (!fileEntry) {
                let fileEntries = await getOrCreateFileEntriesInPath(uri, this.cache.uri2FileItem);
                if (!fileEntries || fileEntries.length === 0) {
                    return;
                }

                fileEntry = fileEntries[fileEntries.length - 1];
            }

            outlineEntries = await this.loadOutlineEntries(fileEntry);
        }

        return outlineEntries;
    }

    async getFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let entry = this.cache.uri2FileItem.get(uri.toString());
        if (!entry) {
            const entries = await getOrCreateFileEntriesInPath(uri, this.cache.uri2FileItem);
            if (entries.length === 0) {
                return;
            }

            entry = entries[entries.length - 1];
        }

        return entry;
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
                await this.loadOutlineEntriesInDir(element);
            } else {
                await this.loadOutlineEntries(element);
            }
        }


        this.DataChanged(element);
    }

    DataChanged(item: OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async addOutlineExplorerFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await getOrCreateFileEntriesInPath(uri, this.cache.uri2FileItem);

        if (items.length === 0) {
            return;
        }

        let item = items[items.length - 1];

        if (item.parent) {
            await this.loadOutlineEntriesInDir(item.parent);
        }

        return item;
    }

    removeOutlineExplorerItem(uri: vscode.Uri): OutlineExplorerItem | undefined {
        let fileEntry = this.cache.uri2FileItem.get(uri.toString());

        this.cache.uri2FileItem.delete(uri.toString());
        this.cache.uri2OutlineItems.delete(uri.toString());

        if (fileEntry) {
            for (let child of fileEntry.children ?? []) {
                if (child.isFileEntry()) {
                    this.removeOutlineExplorerItem(child.fileItem.uri);
                }
            }
            let parent = fileEntry.parent;
            if (parent) {
                parent.children = parent.children?.filter(item => item !== fileEntry);
            }
        }

        return fileEntry;
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

            if (element.isFileEntry()) {
                let children = await element.getChildren(this.cache, this.getIgnoredUris(element.fileItem.uri));
                if (!children) {
                    return [];
                }

                return children;
            } else if (element.isOutlineEntry()) {
                return [];
            }

            Logger.Error('getChildren Invalid OutlineExploreEntry', element);
            throw new Error('getChildren Invalid OutlineExploreEntry');
        }

        return this.loadWorkspaceFolderItems();
    }

    async loadOutlineEntries(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> {
        let entries = await OutlineExplorerOutlineItem.loadOutlineEntries(element, this.cache);

        return entries;
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

    async loadOutlineEntriesInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        return OutlineExplorerFileItem.loadOutlineEntriesInDir(element, this.getIgnoredUris(element.fileItem.uri), this.cache);
    }

    async loadWorkspaceFolderItems(): Promise<OutlineExplorerItem[]> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerItem>();
        for (let workspaceFolder of workspaceFolders) {

            let workspaceFolderEntry = this.cache.uri2FileItem.get(workspaceFolder.uri.toString());
            if (workspaceFolderEntry) {
                workspaceFolderItems.push(workspaceFolderEntry);
                continue;
            }

            workspaceFolderEntry = new OutlineExplorerFileItem(new FileItem(workspaceFolder.uri, vscode.FileType.Directory));

            this.cache.uri2FileItem.set(workspaceFolder.uri.toString(), workspaceFolderEntry);

            await this.loadOutlineEntriesInDir(workspaceFolderEntry);

            workspaceFolderItems.push(workspaceFolderEntry);
        }

        return workspaceFolderItems;
    }
}