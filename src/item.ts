import * as vscode from 'vscode';

import { SymbolKind2IconId, OutlineInfo } from './outline';
import { FileInfo } from './file';

import * as Logger from './log';
import * as uuid from './id';

export enum ItemType {
    File,
    Outline
}

export abstract class Item {
    fileInfo: FileInfo;
    parent: Item | undefined;
    children: Item[] | undefined;

    treeItem: vscode.TreeItem | undefined;

    constructor(fileInfo: FileInfo, parent?: Item) {
        this.fileInfo = fileInfo;
        this.parent = parent;
    }

    abstract GetItemType(): ItemType;
    abstract OnClick(): void;
    abstract CreateTreeItem(): Promise<vscode.TreeItem>;


    async GetTreeItem(): Promise<vscode.TreeItem> {
        if (!this.treeItem) {
            this.treeItem = await this.CreateTreeItem();
        }

        return this.treeItem;
    }

    /**
     * Set the collapsible state of the item. Maintain the item_manager's expandedItems set before this method is called.
     * @param state 
     */
    async SetCollapsibleState(state: vscode.TreeItemCollapsibleState) {
        if (!this.treeItem) {
            this.treeItem = await this.CreateTreeItem();
        } else {
            let id = await uuid.GenerateUid();
            this.treeItem.id = id;
        }

        this.treeItem.collapsibleState = state;
    }
}

export class FileItem extends Item {
    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(uri: vscode.Uri, type: vscode.FileType) {
        super(new FileInfo(uri, type));
    }

    GetItemType(): ItemType {
        return ItemType.File;
    }

    OnClick() {
        vscode.commands.executeCommand('vscode.open', this.fileInfo.uri);
    }

    CreateTreeItem(): Promise<vscode.TreeItem> {
        return this.treeItemFactory.Create(this);
    }
}

export class OutlineItem extends Item {
    declare children: OutlineItem[] | undefined;

    outlineInfo: OutlineInfo;

    private treeItemFactory: TreeItemFactory = NewTreeItemFactory();

    constructor(fileItem: FileInfo, parent: Item | undefined, documentSymbol: vscode.DocumentSymbol) {
        super(fileItem, parent);
        this.outlineInfo = { documentSymbol };

        if (documentSymbol.children.length > 0) {
            this.children = [];

            for (let child of documentSymbol.children) {
                let c = new OutlineItem(fileItem, this, child);
                this.children.push(c);
            }
        }
    }

    GetItemType(): ItemType {
        return ItemType.Outline;
    }

    async OnClick() {
        const documentSymbol = this.outlineInfo.documentSymbol;
        const selection = new vscode.Selection(documentSymbol.selectionRange.start, documentSymbol.selectionRange.start);

        let targetEditor = vscode.window.activeTextEditor;
        let document = targetEditor?.document;

        let uri = this.fileInfo.uri;

        if (!document || document.uri.toString() !== uri.toString()) {
            document = await vscode.workspace.openTextDocument(uri.path);
        }

        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, selection: selection });
    }

    async CreateTreeItem(): Promise<vscode.TreeItem> {
        return this.treeItemFactory.Create(this);
    }

    GetMatchedItemInRange(range: vscode.Range): Item | undefined {
        let documentSymbol = this.outlineInfo.documentSymbol;

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


interface TreeItemFactory {
    Create(element: Item): Promise<vscode.TreeItem>;
}

function NewTreeItemFactory(): TreeItemFactory {
    return new TreeItemFactoryImpl();
}


class TreeItemFactoryImpl implements TreeItemFactory {
    async Create(element: Item): Promise<vscode.TreeItem> {
        let itemType = element.GetItemType();

        let treeItem: vscode.TreeItem;

        if (itemType === ItemType.File) {
            treeItem = this.fromFileItem(element as FileItem);
        } else if (itemType === ItemType.Outline) {
            treeItem = this.fromOutlineItem(element as OutlineItem);
        } else {
            Logger.Error('TreeItemFactoryImpl Create Invalid OutlineExploreItem ', element);
            throw new Error('TreeItemFactoryImpl Create Invalid OutlineExploreItem ');
        }

        treeItem.id = await uuid.GenerateUid();

        return treeItem;
    }

    fromFileItem(element: FileItem): vscode.TreeItem {
        if (!element.fileInfo) {
            Logger.Error('createFileInfo TreeItem Invalid OutlineExploreItem ');
            throw new Error('createFileInfo TreeItem Invalid OutlineExploreItem ');
        }

        let fileItem = element.fileInfo;

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

    fromOutlineItem(element: OutlineItem): vscode.TreeItem {
        if (!element.outlineInfo || !element.outlineInfo.documentSymbol) {
            Logger.Error('createOutlineItem TreeItem Invalid OutlineExploreItem ', element);
            throw new Error('createOutlineItem TreeItem Invalid OutlineExploreItem ');
        }

        let documentSymbol = element.outlineInfo.documentSymbol;

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
