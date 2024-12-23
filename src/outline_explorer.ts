import * as vscode from 'vscode';
import * as path from 'path';

import { GetOutline, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileEntriesInPath, getFileEntriesInDir, isInWorkspace, isFile } from './file';
import * as eventHandler from './listener';
import * as Logger from './log';


function GetMatchedEntryOfRange(entry: OutlineExplorerItem, range: vscode.Range): OutlineExplorerItem | undefined {
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

export class OutlineExplorerItem {
    private _type: OutlineExplorerItemType;
    private _fileItem: FileItem;
    private _outlineItem: OutlineItem | undefined;

    private _parent: OutlineExplorerItem | undefined;
    private _children: OutlineExplorerItem[] | undefined;

    constructor(fileEntry: FileItem, outlineEntry: OutlineItem | undefined) {
        this._type = outlineEntry ? OutlineExplorerItemType.Outline : OutlineExplorerItemType.File;
        this._fileItem = fileEntry;
        this._outlineItem = outlineEntry;

        this._parent = undefined;
        this._children = undefined;
    }


    isFileEntry(): boolean {
        return this._type === OutlineExplorerItemType.File;
    }

    isOutlineEntry(): boolean {
        return this._type === OutlineExplorerItemType.Outline;
    }

    // ============== getter ================
    get fileItem(): FileItem {
        return this._fileItem;
    }

    get outlineItem(): OutlineItem | undefined {
        return this._outlineItem;
    }


    // ============== getter and setter ================
    get parent(): OutlineExplorerItem | undefined {
        return this._parent;
    }
    set parent(value: OutlineExplorerItem | undefined) {
        this._parent = value;
    }

    get children(): OutlineExplorerItem[] | undefined {
        return this._children;
    }
    set children(value: OutlineExplorerItem[] | undefined) {
        this._children = value;
    }
}

class OutlineExplorerEntryFactory {
    static NewByOutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerItem): OutlineExplorerItem {
        let outlineEntry = { documentSymbol };

        let item = new OutlineExplorerItem(parent.fileItem, outlineEntry);
        item.parent = parent;

        return item;
    }
}


// create file entries of uri and it's parents, if uri is out of workspaces, return empty
async function getOrCreateFileEntriesInPath(uri: vscode.Uri, uri2OutlineExplorerFileItem: Map<string, OutlineExplorerItem>): Promise<OutlineExplorerItem[]> {
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


        let item = new OutlineExplorerItem(fileEntry, undefined);
        item.parent = i === 0 ? undefined : fileOutlineExplorerEntries[i - 1];

        fileOutlineExplorerEntries.push(item);
    }

    for (let item of fileOutlineExplorerEntries) {
        if (!item.isFileEntry()) {
            continue;
        }

        uri2OutlineExplorerFileItem.set(item.fileItem.uri.toString(), item);
    }
    return fileOutlineExplorerEntries;
}



function createFileEntryTreeItem(element: OutlineExplorerItem): vscode.TreeItem {
    if (!element.isFileEntry || !element.fileItem) {
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

function createOutlineEntryTreeItem(element: OutlineExplorerItem): vscode.TreeItem {
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

        if (!(item.isOutlineEntry() && item.outlineItem)) {
            return;
        }

        const documentSymbol = item.outlineItem.documentSymbol;
        const selection = new vscode.Selection(documentSymbol.selectionRange.start, documentSymbol.selectionRange.start);

        let targetEditor = vscode.window.activeTextEditor;
        let document = targetEditor?.document;

        if (!document || document.uri.toString() !== item.fileItem.uri.toString()) {
            document = await vscode.workspace.openTextDocument(item.fileItem.uri.path);
        }

        this.ignoreActiveEditorChange = true;
        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, selection: selection });
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

    private uri2OutlineItems: Map<string, OutlineExplorerItem[]> = new Map();
    private uri2FileItem: Map<string, OutlineExplorerItem> = new Map();

    private workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();


    constructor(context: vscode.ExtensionContext) {
        this.UpdateIgnoreFiles();
    }

    async getOutlineItems(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        let fileEntry = this.uri2FileItem.get(uri.toString());
        let outlineEntries = this.uri2OutlineItems.get(uri.toString());

        if (!outlineEntries) {
            // create file entry
            if (!fileEntry) {
                let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileItem);
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
        let entry = this.uri2FileItem.get(uri.toString());
        if (!entry) {
            const entries = await getOrCreateFileEntriesInPath(uri, this.uri2FileItem);
            if (entries.length === 0) {
                return;
            }

            entry = entries[entries.length - 1];
        }

        return entry;
    }

    deleteAllChildren(element: OutlineExplorerItem) {
        this.uri2OutlineItems.delete(element.fileItem.uri.toString());
        this.uri2FileItem.delete(element.fileItem.uri.toString());

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
                console.log("refresh dir", element.fileItem.uri);
                await this.loadOutlineEntriesInDir(element);
            } else {
                console.log("refresh file", element.fileItem.uri);
                await this.loadOutlineEntries(element);
            }
        }


        this.DataChanged(element);
    }


    DataChanged(item: OutlineExplorerItem | OutlineExplorerItem[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async UpdateIgnoreFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }


    async addOutlineExplorerFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await getOrCreateFileEntriesInPath(uri, this.uri2FileItem);

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
        let fileEntry = this.uri2FileItem.get(uri.toString());

        this.uri2FileItem.delete(uri.toString());
        this.uri2OutlineItems.delete(uri.toString());

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
        if (element.isFileEntry()) {
            return createFileEntryTreeItem(element);
        }
        if (element.outlineItem) {
            return createOutlineEntryTreeItem(element);
        }

        Logger.Error('getTreeItem Invalid OutlineExploreEntry', element);
        throw new Error('getTreeItem Invalid OutlineExploreEntry');
    }

    async getParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        const uri = element.fileItem.uri;
        if (element.isFileEntry()) {
            let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileItem);
            if (!fileEntries || fileEntries.length === 0) {
                return undefined;
            }

            return fileEntries[fileEntries.length - 1].parent;

        } else if (element.outlineItem) {
            const targetOutlineEntry = element.outlineItem;
            let outlineExplorerItems = this.uri2OutlineItems.get(uri.toString());

            if (!outlineExplorerItems) {
                outlineExplorerItems = await this.loadOutlineEntries(element);
            }

            const outlineEntries = outlineExplorerItems.map(item => item.outlineItem).filter(entry => entry !== undefined);

            const parents = getParentsOfDocumentSymbol(outlineEntries, targetOutlineEntry.documentSymbol);
            if (!parents) {
                return undefined;
            }

            if (parents.length === 0) {
                let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileItem);
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

        return undefined;
    }

    documentSymbol2OutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerItem): OutlineExplorerItem {
        const result = OutlineExplorerEntryFactory.NewByOutlineEntry(documentSymbol, parent);

        if (documentSymbol.children.length > 0) {
            result.children = [];
            let p = result;
            for (let child of documentSymbol.children) {
                let childEntry = this.documentSymbol2OutlineEntry(child, p);
                result.children.push(childEntry);
                p = childEntry;
            }
        }

        return result;
    }

    async loadOutlineEntries(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element.fileItem.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileItem.uri;
        const outlineItems = await GetOutline(uri);
        let entries = outlineItems.map(documentSymbol => {
            return this.documentSymbol2OutlineEntry(documentSymbol, element);
        });

        element.children = entries;

        this.uri2OutlineItems.set(uri.toString(), entries);
        return entries;
    }

    async loadOutlineEntriesInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        let uri = element.fileItem.uri;
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        let ignoredUris: vscode.Uri[] | undefined;
        if (workspaceFolder) {
            ignoredUris = this.workspaceFolder2IgnoreUris.get(workspaceFolder.uri.toString());
        }

        let fileEntries = await getFileEntriesInDir(uri, ignoredUris);

        const outlineExplorerEntries = fileEntries.map(fileEntry => {
            let item = this.uri2FileItem.get(fileEntry.uri.toString());

            if (!item) {
                item = new OutlineExplorerItem(fileEntry, undefined);
            }

            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerEntries) {
            this.uri2FileItem.set(item.fileItem.uri.toString(), item);
        }

        element.children = outlineExplorerEntries;

        return outlineExplorerEntries;
    }

    async getChildren(element?: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element) {
            if (element.children) {
                return element.children;
            }

            if (element.isFileEntry()) {
                // if directory, read directory and return children
                if (element.fileItem.type === vscode.FileType.Directory) {
                    return this.loadOutlineEntriesInDir(element);
                } else {
                    return this.loadOutlineEntries(element);
                }
            } else if (element.outlineItem) {
                return [];
            }

            Logger.Error('getChildren Invalid OutlineExploreEntry', element);
            throw new Error('getChildren Invalid OutlineExploreEntry');
        }

        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerItem>();
        for (let workspaceFolder of workspaceFolders) {

            let workspaceFolderEntry = this.uri2FileItem.get(workspaceFolder.uri.toString());
            if (workspaceFolderEntry) {
                workspaceFolderItems.push(workspaceFolderEntry);
                continue;
            }

            workspaceFolderEntry = new OutlineExplorerItem(new FileItem(workspaceFolder.uri, vscode.FileType.Directory), undefined);

            this.uri2FileItem.set(workspaceFolder.uri.toString(), workspaceFolderEntry);

            await this.loadOutlineEntriesInDir(workspaceFolderEntry);

            workspaceFolderItems.push(workspaceFolderEntry);
        }

        return workspaceFolderItems;
    }
}