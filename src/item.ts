import * as vscode from 'vscode';

import { GetDocumentSymbols, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileItemsInPath, getFileItemsInDir } from './file';

import * as Logger from './log';

export enum OutlineExplorerItemType {
    File,
    Outline
}

export interface OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    GetTreeItem(): vscode.TreeItem;
    GetItemType(): OutlineExplorerItemType;

    OnClick(): void;
}

export class OutlineExplorerFileItem implements OutlineExplorerItem {
    fileItem: FileItem;
    parent: OutlineExplorerItem | undefined;
    children: OutlineExplorerItem[] | undefined;

    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(uri: vscode.Uri, type: vscode.FileType) {
        this.fileItem = new FileItem(uri, type);
    }

    GetItemType(): OutlineExplorerItemType {
        return OutlineExplorerItemType.File;
    }

    OnClick() {
        vscode.commands.executeCommand('vscode.open', this.fileItem.uri);
    }

    GetTreeItem(): vscode.TreeItem {
        return this.treeItemFactory.Create(this);
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

    GetItemType(): OutlineExplorerItemType {
        return OutlineExplorerItemType.Outline;
    }

    async OnClick() {
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

    GetTreeItem(): vscode.TreeItem {
        return this.treeItemFactory.Create(this);
    }

    GetMatchedItemInRange(range: vscode.Range): OutlineExplorerItem | undefined {
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
            let result = child.GetMatchedItemInRange(range);
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
}

export class Uri2OutlineExplorerItemIndex {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
}


interface TreeItemFactory {
    Create(element: OutlineExplorerItem): vscode.TreeItem;
}

function NewTreeItemFactory(): TreeItemFactory {
    return new TreeItemFactoryImpl();
}


class TreeItemFactoryImpl implements TreeItemFactory {
    Create(element: OutlineExplorerItem): vscode.TreeItem {
        let itemType = element.GetItemType();

        if (itemType === OutlineExplorerItemType.File) {
            return this.fromOutlineExplorerFileItem(element as OutlineExplorerFileItem);
        } else if (itemType === OutlineExplorerItemType.Outline) {
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
