import * as vscode from 'vscode';
import * as path from 'path';
import * as outlineProvider from './outline_info';
import * as fileSystemProvider from './file_info';
import * as eventHandler from './listener';


export class FileEntry {
    uri: vscode.Uri;
    type: vscode.FileType;
    constructor(uri: vscode.Uri, type: vscode.FileType) {
        this.uri = uri;
        this.type = type;
    }
}

export class OutlineEntry {
    documentSymbol: vscode.DocumentSymbol;
    constructor(documentSymbol: vscode.DocumentSymbol) {
        this.documentSymbol = documentSymbol;
    }
}

function GetMatchedEntryOfRange(entry: OutlineExplorerEntry, range: vscode.Range): OutlineExplorerEntry | undefined {
    if (!entry.outlineEntry) {
        return undefined;
    }

    let documentSymbol = entry.outlineEntry.documentSymbol;

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

enum OutlineExplorerEntryType {
    Default = 0,
    File,
    Outline,
}

export class OutlineExplorerEntry {
    private _type: OutlineExplorerEntryType;
    private _fileEntry: FileEntry;
    private _outlineEntry: OutlineEntry | undefined;

    private _parent: OutlineExplorerEntry | undefined;
    private _children: OutlineExplorerEntry[] | undefined;

    constructor(fileEntry: FileEntry, outlineEntry: OutlineEntry | undefined) {
        this._type = outlineEntry ? OutlineExplorerEntryType.Outline : OutlineExplorerEntryType.File;
        this._fileEntry = fileEntry;
        this._outlineEntry = outlineEntry;

        this._parent = undefined;
        this._children = undefined;
    }


    isFileEntry(): boolean {
        return this._type === OutlineExplorerEntryType.File;
    }

    isOutlineEntry(): boolean {
        return this._type === OutlineExplorerEntryType.Outline;
    }

    // ============== getter ================
    get fileEntry(): FileEntry {
        return this._fileEntry;
    }

    get outlineEntry(): OutlineEntry | undefined {
        return this._outlineEntry;
    }


    // ============== getter and setter ================
    get parent(): OutlineExplorerEntry | undefined {
        return this._parent;
    }
    set parent(value: OutlineExplorerEntry | undefined) {
        this._parent = value;
    }

    get children(): OutlineExplorerEntry[] | undefined {
        return this._children;
    }
    set children(value: OutlineExplorerEntry[] | undefined) {
        this._children = value;
    }
}

class OutlineExplorerEntryFactory {
    static NewByOutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerEntry): OutlineExplorerEntry {
        let outlineEntry = { documentSymbol };

        let item = new OutlineExplorerEntry(parent.fileEntry, outlineEntry);
        item.parent = parent;

        return item;
    }
}



// create file entries of uri and it's parents, if uri is out of workspaces, return empty
async function getOrCreateFileEntriesInPath(uri: vscode.Uri, uri2FileEntry: Map<string, OutlineExplorerEntry>): Promise<OutlineExplorerEntry[]> {
    let fileEntriesInPath = await fileSystemProvider.getFileEntriesInPath(uri);
    if (!fileEntriesInPath) {
        return [];
    }

    let fileOutlineExplorerEntries: OutlineExplorerEntry[] = [];
    for (let i = 0; i < fileEntriesInPath.length; i++) {
        const fileEntry = fileEntriesInPath[i];

        let existFileEntry = uri2FileEntry.get(fileEntry.uri.toString());

        if (existFileEntry) {
            fileOutlineExplorerEntries.push(existFileEntry);
            continue;
        }


        let item = new OutlineExplorerEntry(fileEntry, undefined);
        item.parent = i === 0 ? undefined : fileOutlineExplorerEntries[i - 1];


        fileOutlineExplorerEntries.push(item);
    }

    for (let item of fileOutlineExplorerEntries) {
        if (!item.isFileEntry()) {
            continue;
        }

        uri2FileEntry.set(item.fileEntry.uri.toString(), item);
    }
    return fileOutlineExplorerEntries;
}



function createFileEntryTreeItem(element: OutlineExplorerEntry): vscode.TreeItem {
    if (!element.isFileEntry || !element.fileEntry) {
        throw new Error('createFileEntryTreeItem Invalid OutlineExploreEntry');
    }

    let fileEntry = element.fileEntry;

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

function createOutlineEntryTreeItem(element: OutlineExplorerEntry): vscode.TreeItem {
    if (!element.outlineEntry || !element.outlineEntry.documentSymbol) {
        throw new Error('createOutlineEntryTreeItem Invalid OutlineExploreEntry');
    }

    let documentSymbol = element.outlineEntry.documentSymbol;

    const treeItem = new vscode.TreeItem(documentSymbol.name);
    if (documentSymbol.children?.length > 0) {
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    treeItem.iconPath = new vscode.ThemeIcon(outlineProvider.SymbolKind2IconId.get(documentSymbol.kind) || 'symbol-property');
    treeItem.description = documentSymbol.detail;
    treeItem.command = {
        command: 'outline-explorer.item-clicked',
        title: 'Click Item',
        arguments: [element]
    };

    treeItem.contextValue = 'outline';

    return treeItem;
}



export class OutlineExplorerTreeDataProvider extends eventHandler.BaseVSCodeEventListener implements vscode.TreeDataProvider<OutlineExplorerEntry>, eventHandler.VSCodeEventListener {
    private treeDataChangedEventEmitter: vscode.EventEmitter<OutlineExplorerEntry | OutlineExplorerEntry[] | void | void | null | undefined> = new vscode.EventEmitter<OutlineExplorerEntry[]>();
    readonly onDidChangeTreeData: vscode.Event<OutlineExplorerEntry | OutlineExplorerEntry[] | void | null | undefined> = this.treeDataChangedEventEmitter.event;

    private uri2OutlineEntries: Map<string, OutlineExplorerEntry[]> = new Map();
    private uri2FileEntry: Map<string, OutlineExplorerEntry> = new Map();
    private workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();

    private treeView: vscode.TreeView<OutlineExplorerEntry>;
    private ignoreActiveEditorChange = false;
    private treeViewVisible = false;

    constructor(context: vscode.ExtensionContext) {
        super();

        this.treeView = vscode.window.createTreeView('outline-explorer', { treeDataProvider: this });
        this.treeView.onDidChangeVisibility(e => this.OnVisibilityChanged(e));

        context.subscriptions.push(this.treeView);
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.item-clicked', async (item) => {
            await this.onclick(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.refresh', (element) => {
            this.refresh(element);
        }, this));

        const eventHandlerManager = new eventHandler.VSCodeEventHandlerManager();
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.TextDocumentChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.ActiveTextEditorChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.TextEditorSelectionChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.WorkspaceFoldersChanged, this);

        this.UpdateIgnoreFiles();

        this.reveal(vscode.window.activeTextEditor?.document.uri);
    }

    async UpdateIgnoreFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    OnVisibilityChanged(e: vscode.TreeViewVisibilityChangeEvent) {
        this.treeViewVisible = e.visible;
    }


    async OnActiveTextEditorChanged(e: vscode.TextEditor | undefined) {
        if (!e) {
            return;
        }

        if (this.ignoreActiveEditorChange) {
            this.ignoreActiveEditorChange = false;
            return;
        }

        if (!this.treeViewVisible) {
            return;
        }

        const uri = e.document.uri;
        await this.reveal(uri);
    }

    async reveal(uri: vscode.Uri | undefined) {
        if (!uri) {
            return;
        }

        let entry = this.uri2FileEntry.get(uri.toString());
        if (!entry) {
            const entries = await getOrCreateFileEntriesInPath(uri, this.uri2FileEntry);
            if (entries.length === 0) {
                return;
            }

            entry = entries[entries.length - 1];
        }

        this.treeView.reveal(entry);
    }


    async OnTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {
        if (!this.treeViewVisible) {
            return;
        }

        const selection = e.selections[0];
        if (selection.isEmpty) {
            return;
        }

        const uri = e.textEditor.document.uri;
        let fileEntry = this.uri2FileEntry.get(uri.toString());
        let outlineEntries = this.uri2OutlineEntries.get(uri.toString());

        if (!outlineEntries) {
            // create file entry
            if (!fileEntry) {
                let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileEntry);
                if (!fileEntries || fileEntries.length === 0) {
                    return;
                }

                fileEntry = fileEntries[fileEntries.length - 1];
            }

            outlineEntries = await this.getOutlineEntries(fileEntry);
        }

        for (let outlineEntry of outlineEntries) {
            if (!outlineEntry.outlineEntry) {
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

        let entry = this.uri2FileEntry.get(uri.toString());
        if (!entry) {
            let entries = await getOrCreateFileEntriesInPath(uri, this.uri2FileEntry);
            if (entries.length === 0) {
                return;
            }
            entry = entries[entries.length - 1];
        }


        this.getOutlineEntries(entry);

        this.treeDataChangedEventEmitter.fire(entry);
    }
    removeOutlineEntry(uri: vscode.Uri) {
        let fileEntry = this.uri2FileEntry.get(uri.toString());
        if (fileEntry) {
            for (let child of fileEntry.children ?? []) {
                if (child.isFileEntry()) {
                    this.removeOutlineEntry(child.fileEntry.uri);
                }
            }
        }

        this.uri2FileEntry.delete(uri.toString());
        this.uri2OutlineEntries.delete(uri.toString());
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        for (let removed of event.removed) {
            this.removeOutlineEntry(removed.uri);
        }

        this.treeDataChangedEventEmitter.fire();
    }

    getTreeItem(element: OutlineExplorerEntry): vscode.TreeItem {
        console.log('getTreeItem', element);

        if (element.isFileEntry()) {
            return createFileEntryTreeItem(element);
        }
        if (element.outlineEntry) {
            return createOutlineEntryTreeItem(element);
        }

        throw new Error('getTreeItem Invalid OutlineExploreEntry');
    }

    async getParent(element: OutlineExplorerEntry): Promise<OutlineExplorerEntry | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        const uri = element.fileEntry.uri;
        if (element.isFileEntry()) {
            let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileEntry);
            if (!fileEntries || fileEntries.length === 0) {
                return undefined;
            }

            return fileEntries[fileEntries.length - 1].parent;

        } else if (element.outlineEntry) {
            const targetOutlineEntry = element.outlineEntry;
            let outlineExplorerItems = this.uri2OutlineEntries.get(uri.toString());

            if (!outlineExplorerItems) {
                outlineExplorerItems = await this.getOutlineEntries(element);
            }

            const outlineEntries = outlineExplorerItems.map(item => item.outlineEntry).filter(entry => entry !== undefined);

            const parents = outlineProvider.getParentsOfDocumentSymbol(outlineEntries, targetOutlineEntry.documentSymbol);
            if (!parents) {
                return undefined;
            }

            if (parents.length === 0) {
                let fileEntries = await getOrCreateFileEntriesInPath(uri, this.uri2FileEntry);
                if (fileEntries.length === 0) {
                    return undefined;
                }

                return fileEntries[fileEntries.length - 1];
            } else {
                const parentOutlineEntry = parents[parents.length - 1];
                const parentEntry = outlineExplorerItems.find(item => {
                    if (!item.outlineEntry) {
                        return false;
                    }
                    return item.outlineEntry === parentOutlineEntry;
                });

                if (parentEntry) {
                    return parentEntry;
                }
                return undefined;
            }
        }

        return undefined;
    }

    documentSymbol2OutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerEntry): OutlineExplorerEntry {
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

    async getOutlineEntries(element: OutlineExplorerEntry): Promise<OutlineExplorerEntry[]> {
        if (element.fileEntry.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileEntry.uri;
        const outlineItems = await outlineProvider.GetOutline(uri);
        let entries = outlineItems.map(documentSymbol => {
            return this.documentSymbol2OutlineEntry(documentSymbol, element);
        });

        element.children = entries;

        this.uri2OutlineEntries.set(uri.toString(), entries);
        return entries;
    }

    async getOutlineEntriesChildren(element: OutlineExplorerEntry): Promise<OutlineExplorerEntry[]> {
        let uri = element.fileEntry.uri;
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        let ignoredUris: vscode.Uri[] | undefined;
        if (workspaceFolder) {
            ignoredUris = this.workspaceFolder2IgnoreUris.get(workspaceFolder.uri.toString());
        }

        let fileEntries = await fileSystemProvider.getFileEntriesInDir(uri, ignoredUris);

        const outlineExplorerEntries = fileEntries.map(fileEntry => {
            let item = new OutlineExplorerEntry(fileEntry, undefined);
            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerEntries) {
            this.uri2FileEntry.set(item.fileEntry.uri.toString(), item);
        }

        element.children = outlineExplorerEntries;

        return outlineExplorerEntries;
    }

    async getChildren(element?: OutlineExplorerEntry): Promise<OutlineExplorerEntry[]> {
        console.log('getChildren', element);
        if (element) {
            if (element.children) {
                return element.children;
            }

            if (element.isFileEntry()) {
                // if directory, read directory and return children
                if (element.fileEntry.type === vscode.FileType.Directory) {
                    return this.getOutlineEntriesChildren(element);
                } else {
                    return this.getOutlineEntries(element);
                }
            } else if (element.outlineEntry) {
                return [];
            }
            throw new Error('getChildren Invalid OutlineExploreEntry');
        }

        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<OutlineExplorerEntry>();
        for (let workspaceFolder of workspaceFolders) {

            let workspaceFolderEntry = this.uri2FileEntry.get(workspaceFolder.uri.toString());
            if (workspaceFolderEntry) {
                workspaceFolderItems.push(workspaceFolderEntry);
                continue;
            }

            workspaceFolderEntry = new OutlineExplorerEntry(new FileEntry(workspaceFolder.uri, vscode.FileType.Directory), undefined);

            this.uri2FileEntry.set(workspaceFolder.uri.toString(), workspaceFolderEntry);

            await this.getOutlineEntriesChildren(workspaceFolderEntry);

            workspaceFolderItems.push(workspaceFolderEntry);
        }

        if (workspaceFolderItems.length === 1) {
            return workspaceFolderItems[0].children ?? [];
        }

        return workspaceFolderItems;
    }
    async onclick(item: OutlineExplorerEntry) {
        if (!item) {
            return;
        }

        if (!(item.isOutlineEntry() && item.outlineEntry)) {
            return;
        }

        const documentSymbol = item.outlineEntry.documentSymbol;
        const selection = new vscode.Selection(documentSymbol.selectionRange.start, documentSymbol.selectionRange.start);

        let targetEditor = vscode.window.activeTextEditor;
        let document = targetEditor?.document;

        if (!document || document.uri.toString() !== item.fileEntry.uri.toString()) {
            document = await vscode.workspace.openTextDocument(item.fileEntry.uri.path);
        }

        this.ignoreActiveEditorChange = true;
        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, selection: selection });
        return;
    }
    refresh(element: OutlineExplorerEntry | undefined): void {
        console.log('refresh', element);
        this.treeDataChangedEventEmitter.fire(element);
    }
}