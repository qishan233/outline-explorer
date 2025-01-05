import * as vscode from 'vscode';

import { GetDocumentSymbols, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileItemsInPath, getFileItemsInDir } from './file';
import * as Logger from './log';


export class Uri2OutlineExplorerItemIndex {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
}


export interface OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    getChildren(index: Uri2OutlineExplorerItemIndex, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined>;
    getParent(index: Uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined>;
    getTreeItem(): vscode.TreeItem;

    isFileItem(): boolean;
    isOutlineItem(): boolean;

    onClick(): void;
}

export class OutlineExplorerFileItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(uri: vscode.Uri, type: vscode.FileType) {
        this.fileItem = new FileItem(uri, type);
    }

    isFileItem(): boolean {
        return true;
    }

    isOutlineItem(): boolean {
        return false;
    }

    onClick() {
        vscode.commands.executeCommand('vscode.open', this.fileItem.uri);
    }

    getTreeItem(): vscode.TreeItem {
        return this.treeItemFactory.Create(this);
    }

    async getChildren(index: Uri2OutlineExplorerItemIndex, ignoredUri: vscode.Uri[]): Promise<OutlineExplorerItem[] | undefined> {
        let children: OutlineExplorerItem[] | undefined = undefined;
        if (this.fileItem.type === vscode.FileType.Directory) {
            children = await OutlineExplorerFileItem.loadItemsInDir(this, ignoredUri, index);
        } else {
            children = await OutlineExplorerOutlineItem.loadOutlineItems(this, index);
        }

        this.children = children;

        return this.children;
    }

    async getParent(index: Uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined> {
        const uri = this.fileItem.uri;
        let fileItems = await OutlineExplorerFileItem.loadFileItemsInPath(uri, index.uri2FileItem);
        if (!fileItems || fileItems.length === 0) {
            this.parent = undefined;
        } else {
            fileItems[fileItems.length - 1].parent;
        }

        return this.parent;
    }

    static async loadItemsInDir(element: OutlineExplorerItem, ignoredUris: vscode.Uri[], index: Uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem[]> {
        let uri = element.fileItem.uri;

        let fileItems = await getFileItemsInDir(uri, ignoredUris);

        const outlineExplorerFileItems = fileItems.map(fileItem => {
            let item = index.uri2FileItem.get(fileItem.uri.toString());

            if (!item) {
                item = new OutlineExplorerFileItem(fileItem.uri, fileItem.type);
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

            let item = new OutlineExplorerFileItem(fileItem.uri, fileItem.type);
            item.parent = i === 0 ? undefined : outlineExplorerFileItems[i - 1];

            outlineExplorerFileItems.push(item);
        }

        for (let item of outlineExplorerFileItems) {
            uri2OutlineExplorerFileItem.set(item.fileItem.uri.toString(), item);
        }

        return outlineExplorerFileItems;
    }

}

export class OutlineExplorerOutlineItem implements OutlineExplorerItem {
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
        return this.treeItemFactory.Create(this);
    }

    async getChildren(): Promise<OutlineExplorerItem[] | undefined> {
        return this.children;
    }

    async getParent(index: Uri2OutlineExplorerItemIndex): Promise<OutlineExplorerItem | undefined> {
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

    static async loadOutlineItems(element: OutlineExplorerItem, index: Uri2OutlineExplorerItemIndex): Promise<OutlineExplorerOutlineItem[]> {
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
    Create(element: OutlineExplorerItem): vscode.TreeItem;
}

function NewTreeItemFactory(): TreeItemFactory {
    return new TreeItemFactoryImpl();
}


class TreeItemFactoryImpl implements TreeItemFactory {
    Create(element: OutlineExplorerItem): vscode.TreeItem {
        if (element.isFileItem()) {
            return this.fromOutlineExplorerFileItem(element as OutlineExplorerFileItem);
        } else if (element.isOutlineItem()) {
            return this.fromOutlineExplorerOutlineItem(element as OutlineExplorerOutlineItem);
        }

        Logger.Error('TreeItemFactoryImpl Create Invalid OutlineExploreItem ', element);
        throw new Error('TreeItemFactoryImpl Create Invalid OutlineExploreItem ');
    }

    fromOutlineExplorerFileItem(element: OutlineExplorerFileItem): vscode.TreeItem {
        if (!element.fileItem) {
            Logger.Error('createFileItem TreeItem Invalid OutlineExploreItem ');
            throw new Error('createFileItem TreeItem Invalid OutlineExploreItem ');
        }

        let fileItem = element.fileItem;

        const treeItem = new vscode.TreeItem(fileItem.uri);
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

        if (fileItem.type === vscode.FileType.File) {
            treeItem.iconPath = vscode.ThemeIcon.File;
            treeItem.command = {
                command: 'outline-explorer.item-clicked',
                title: 'Click Item',
                arguments: [element]
            };
        } else {
            treeItem.iconPath = vscode.ThemeIcon.Folder;
        }

        treeItem.contextValue = fileItem.type === vscode.FileType.File ? 'file' : 'folder';

        return treeItem;
    }

    fromOutlineExplorerOutlineItem(element: OutlineExplorerOutlineItem): vscode.TreeItem {
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
