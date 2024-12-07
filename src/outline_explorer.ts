import * as vscode from 'vscode';
import * as path from 'path';
import * as outlineProvider from './outline_info';
import * as fileSystemProvider from './file_info';
import * as eventHandler from './listener';


export interface FileEntry {
    uri: vscode.Uri;
    type: vscode.FileType;
}

export interface OutlineEntry {
    documentSymbol: vscode.DocumentSymbol;
}

function GetMatchedEntryOfRange(entry: OutlineExplorerEntry, range: vscode.Range): OutlineExplorerEntry | undefined {
    if (!entry.outlineEntry) {
        return undefined;
    }

    let documentSymbol = entry.outlineEntry.documentSymbol;

    if (documentSymbol.selectionRange.isEqual(range)) {
        return entry;
    }

    if (!documentSymbol.range.contains(range)) {
        return undefined;
    }

    if (!entry.children) {
        return undefined;
    }

    for (let child of entry.children) {
        let result = GetMatchedEntryOfRange(child, range);
        if (result) {
            return result;
        }
    }

    return undefined;
}

export interface OutlineExplorerEntry {
    isFileEntry: boolean;
    fileEntry: FileEntry;
    outlineEntry: OutlineEntry | undefined;
    parent: OutlineExplorerEntry | undefined;
    children: OutlineExplorerEntry[] | undefined;
}

function newOutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerEntry): OutlineExplorerEntry {
    return {
        isFileEntry: false,
        fileEntry: parent.fileEntry,
        outlineEntry: { documentSymbol },
        parent: parent,
        children: undefined
    };
}

// 创建 uri 及其 parent 对应的文件实体，如果 uri 是 workspace folder，则返回空
async function createFileEntriesInPath(uri: vscode.Uri, uri2FileEntry: Map<string, OutlineExplorerEntry>): Promise<OutlineExplorerEntry[]> {
    // 创建对应的文件实体
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

        let item = {
            isFileEntry: true,
            fileEntry: fileEntry,
            outlineEntry: undefined,
            parent: i === 0 ? undefined : fileOutlineExplorerEntries[i - 1],
            children: undefined
        };

        fileOutlineExplorerEntries.push(item);
    }

    for (let item of fileOutlineExplorerEntries) {
        if (!item.isFileEntry) {
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

        const eventHandlerManager = new eventHandler.VSCodeEventHandlerManager();
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.TextDocumentChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.ActiveTextEditorChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.TextEditorSelectionChanged, this);
        eventHandlerManager.RegisterEventListener(eventHandler.VSCodeEvent.WorkspaceFoldersChanged, this);

        this.UpdateIgnoreFiles();
    }

    async UpdateIgnoreFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    OnVisibilityChanged(e: vscode.TreeViewVisibilityChangeEvent) {
        console.log("onDidChangeVisibility", e);
        this.treeViewVisible = e.visible;
    }


    async OnActiveTextEditorChanged(e: vscode.TextEditor | undefined) {
        console.log("ActiveTextEditor 发生了变化:", e);
        if (!e) {
            console.info("onActiveEditorChanged 未找到活动编辑器");
            return;
        }

        const uri = e.document.uri;
        if (this.ignoreActiveEditorChange) {
            console.log("忽略活动编辑器变化");
            this.ignoreActiveEditorChange = false;
            return;
        }

        if (!this.treeViewVisible) {
            console.log("onActiveEditorChanged TreeView 未显示");
            return;
        }

        let entry = this.uri2FileEntry.get(uri.toString());
        if (!entry) {
            const entries = await createFileEntriesInPath(uri, this.uri2FileEntry);
            if (entries.length === 0) {
                console.log("onActiveEditorChanged 未找到对应的OutlineExplorerItem", uri.toString());
                return;
            }
            console.log("加载了新的文件实体", entries);
            entry = entries[entries.length - 1];
        }
        this.treeView.reveal(entry);
    }


    async OnTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {
        const selection = e.selections[0];
        if (selection.isEmpty) {
            return;
        }

        const uri = e.textEditor.document.uri;
        let fileEntry = this.uri2FileEntry.get(uri.toString());
        let outlineEntries = this.uri2OutlineEntries.get(uri.toString());

        if (!outlineEntries) {
            // 创建 file entry
            if (!fileEntry) {
                let fileEntries = await createFileEntriesInPath(uri, this.uri2FileEntry);
                if (!fileEntries || fileEntries.length === 0) {
                    console.log("onSelectionChanged createFileEntries 返回的结果为空", uri, fileEntries);
                    return;
                }

                fileEntry = fileEntries[fileEntries.length - 1];
            }
            // 这里考虑是否要通知 TreeView 刷新
            outlineEntries = await this.getOutlineEntries(fileEntry);
        }

        for (let outlineEntry of outlineEntries) {
            if (!outlineEntry.outlineEntry) {
                continue;
            }

            let result = GetMatchedEntryOfRange(outlineEntry, selection);
            if (result) {
                this.treeView.reveal(result);

                console.log("onSelectionChanged 找到对应的item", selection, outlineEntry, result);

                return;
            }
        }

        console.log("onSelectionChanged 未找到对应的item", selection, outlineEntries);
    }

    async OnTextDocumentChanged(e: vscode.TextDocumentChangeEvent) {
        console.log("debouncedOnDocumentUpdate 开始处理事件:", e);
        // 其实是能够做到更精细化的更新的，初步先这样
        const uri = e.document.uri;

        let entry = this.uri2FileEntry.get(uri.toString());
        if (!entry) {
            let entries = await createFileEntriesInPath(uri, this.uri2FileEntry);
            if (entries.length === 0) {
                console.log("onDocumentChanged 未找到对应的OutlineExplorerItem", uri.toString());
                return;
            }
            entry = entries[entries.length - 1];
        }


        this.getOutlineEntries(entry);
        console.log("debouncedOnDocumentUpdate 处理完毕:", entry);

        this.treeDataChangedEventEmitter.fire(entry);
    }
    removeOutlineEntry(uri: vscode.Uri) {
        let fileEntry = this.uri2FileEntry.get(uri.toString());
        if (fileEntry) {
            for (let child of fileEntry.children ?? []) {
                if (child.isFileEntry) {
                    this.removeOutlineEntry(child.fileEntry.uri);
                }
            }
        }

        this.uri2FileEntry.delete(uri.toString());
        this.uri2OutlineEntries.delete(uri.toString());
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        console.log("OnWorkspaceFoldersChanged", event);

        for (let removed of event.removed) {
            this.removeOutlineEntry(removed.uri);
        }

        this.treeDataChangedEventEmitter.fire();
    }

    getTreeItem(element: OutlineExplorerEntry): vscode.TreeItem {
        if (element.isFileEntry && element.fileEntry) {
            return createFileEntryTreeItem(element);
        }
        if (element.outlineEntry) {
            return createOutlineEntryTreeItem(element);
        }

        console.log("非法的 outline entry", element);

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
        if (element.isFileEntry) {
            let fileEntries = await createFileEntriesInPath(uri, this.uri2FileEntry);
            if (!fileEntries || fileEntries.length === 0) {
                console.log("getParent isFileEntry createFileEntries 返回的结果为空", uri, fileEntries);
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
                console.log("getParent 没有找到路径", outlineEntries, element);
                return undefined;
            }

            // 如果是顶级 OutlineExplorerEntry，需要返回文件实体
            if (parents.length === 0) {
                let fileEntries = await createFileEntriesInPath(uri, this.uri2FileEntry);
                if (fileEntries.length === 0) {
                    console.log("getParent outlineEntry createFileEntries 返回的结果为空", uri, fileEntries);
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

                console.log("getParent 未找到对应的父节点", parents);
                return undefined;
            }
        }

        console.log("getParent 错误的数据结构", element);

        return undefined;
    }

    documentSymbol2OutlineEntry(documentSymbol: vscode.DocumentSymbol, parent: OutlineExplorerEntry): OutlineExplorerEntry {
        const result = newOutlineEntry(documentSymbol, parent);

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

        let gitIgnoreUris: vscode.Uri[] | undefined;
        if (workspaceFolder) {
            gitIgnoreUris = this.workspaceFolder2IgnoreUris.get(workspaceFolder.uri.toString());
        }

        let fileEntries = await fileSystemProvider.getFileEntriesInDir(uri, gitIgnoreUris);

        const outlineExplorerEntries = fileEntries.map(fileEntry => {
            return {
                isFileEntry: true,
                fileEntry: fileEntry,
                outlineEntry: undefined,
                parent: element,
                children: undefined
            };
        });

        for (let item of outlineExplorerEntries) {
            this.uri2FileEntry.set(item.fileEntry.uri.toString(), item);
        }

        element.children = outlineExplorerEntries;

        return outlineExplorerEntries;
    }

    async getChildren(element?: OutlineExplorerEntry): Promise<OutlineExplorerEntry[]> {
        if (element) {
            if (element.children) {
                return element.children;
            }

            if (element.isFileEntry) {
                const fileEntry = element.fileEntry;
                const uri = fileEntry.uri;
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

            workspaceFolderEntry = {
                isFileEntry: true,
                fileEntry: { uri: workspaceFolder.uri, type: vscode.FileType.Directory },
                outlineEntry: undefined,
                parent: undefined,
                children: undefined
            } as OutlineExplorerEntry;

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
        console.log("发生点击事件a:", item);
        if (!item) {
            console.log("item 为空");
            return;
        }

        if (item.isFileEntry || !item.outlineEntry) {
            console.log("点击了文件");
            return;
        }

        const documentSymbol = item.outlineEntry.documentSymbol;
        const selection = new vscode.Selection(documentSymbol.selectionRange.start, documentSymbol.selectionRange.start);

        let targetEditor = vscode.window.activeTextEditor;
        let document = targetEditor?.document;

        // 活动编辑器发生了变化，打开新的编辑器
        if (!document || document.uri.toString() !== item.fileEntry.uri.toString()) {
            document = await vscode.workspace.openTextDocument(item.fileEntry.uri.path);
        }

        this.ignoreActiveEditorChange = true;
        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, selection: selection });
        return;
    }
    refresh(element: OutlineExplorerEntry | undefined): void {
        this.treeDataChangedEventEmitter.fire(element);
    }
}