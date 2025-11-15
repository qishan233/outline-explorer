import * as vscode from 'vscode';
import * as path from 'path';

import { Item, ItemType, FileItem, OutlineItem } from './item';
import { GetDocumentSymbols } from './outline';
import { getFileInfosInPath, getFileInfosInDir } from './file';


interface ItemManager {
    LoadItems(uri: vscode.Uri): Promise<Item[] | undefined>
    LoadParent(element: Item): Promise<Item | undefined>
    LoadChildren(element: Item): Promise<Item[]>
    LoadParents(uri: vscode.Uri): Promise<Item[] | undefined>

    GetItems(uri: vscode.Uri): Item[] | undefined
    SetItems(uri: vscode.Uri, items: Item[]): void
    DeleteItems(element: Item): void
}

interface FileItemManager extends ItemManager {
}

export class ItemItemFactory {
    static FileItemManager(): FileItemManager {
        return new FileItemManagerImpl();
    }

    static OutlineItemManager(fileItemLoader: FileItemManager): ItemManager {
        return new OutlineItemManager(fileItemLoader);
    }
}

class FileItemManagerImpl implements FileItemManager {
    uri2FileInfo: Map<string, FileItem> = new Map();
    workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // ignore the .git folder
        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async LoadItems(uri: vscode.Uri): Promise<Item[] | undefined> {
        let items = this.GetItems(uri);
        if (items && items.length > 0) {
            return items;
        }

        items = await this.LoadParents(uri);
        if (!items || items.length === 0) {
            return;
        }

        return items;
    }


    GetItems(uri: vscode.Uri): Item[] | undefined {
        let item = this.uri2FileInfo.get(uri.toString());
        if (!item) {
            return undefined;
        }

        return [item];
    }

    SetItems(uri: vscode.Uri, items: Item[]): void {
        if (items.length !== 1) {
            return;
        }

        const fileItem = items[0];
        if (fileItem.GetItemType() !== ItemType.File) {
            return;
        }

        this.uri2FileInfo.set(uri.toString(), fileItem as FileItem);
    }

    DeleteItems(element: Item): void {
        let uri = element.fileInfo.uri;
        this.uri2FileInfo.delete(uri.toString());

        if (element.GetItemType() === ItemType.File && element.fileInfo.type === vscode.FileType.Directory) {
            for (let child of element.children ?? []) {
                this.DeleteItems(child);
            }
        }
    }

    async LoadParent(element: Item): Promise<Item | undefined> {
        const uri = element.fileInfo.uri;

        let fileItems = await this.LoadParents(uri);
        if (!fileItems || fileItems.length === 0) {
            element.parent = undefined;
        }

        return element.parent;
    }

    async LoadChildren(element: Item): Promise<Item[]> {
        let uri = element.fileInfo.uri;

        let fileItems = await getFileInfosInDir(uri, this.getIgnoredUris(uri));

        const outlineExplorerFileInfos = fileItems.map(fileItem => {
            let item = this.uri2FileInfo.get(fileItem.uri.toString());

            if (!item) {
                item = new FileItem(fileItem.uri, fileItem.type);
            }

            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerFileInfos) {
            this.uri2FileInfo.set(item.fileInfo.uri.toString(), item);
        }

        element.children = outlineExplorerFileInfos;

        return outlineExplorerFileInfos;
    }

    private getIgnoredUris(uri: vscode.Uri): vscode.Uri[] {
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

    async LoadParents(uri: vscode.Uri): Promise<Item[] | undefined> {
        let fileItemsInPath = await getFileInfosInPath(uri);
        if (!fileItemsInPath) {
            return [];
        }

        let outlineExplorerFileInfos: FileItem[] = [];
        for (let i = 0; i < fileItemsInPath.length; i++) {
            const fileItem = fileItemsInPath[i];

            let existFileInfo = this.uri2FileInfo.get(fileItem.uri.toString());
            if (existFileInfo) {
                outlineExplorerFileInfos.push(existFileInfo);
                continue;
            }

            let item = new FileItem(fileItem.uri, fileItem.type);
            item.parent = i === 0 ? undefined : outlineExplorerFileInfos[i - 1];

            outlineExplorerFileInfos.push(item);
        }

        for (let item of outlineExplorerFileInfos) {
            this.uri2FileInfo.set(item.fileInfo.uri.toString(), item);
        }

        return outlineExplorerFileInfos;
    }
}


class OutlineItemManager implements ItemManager {
    uri2OutlineItems: Map<string, OutlineItem[]> = new Map();
    fileItemManager: ItemManager;

    constructor(fileItemManager: ItemManager) {
        this.fileItemManager = fileItemManager;
    }

    async LoadItems(uri: vscode.Uri): Promise<Item[] | undefined> {
        let elements = await this.fileItemManager.LoadItems(uri);
        if (!elements || elements.length === 0) {
            return;
        }

        let element = elements[0];

        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineItem(element.fileInfo, element, documentSymbol);
        });

        element.children = items;

        this.uri2OutlineItems.set(element.fileInfo.uri.toString(), items);

        return items;

    }
    GetItems(uri: vscode.Uri): Item[] | undefined {
        return this.uri2OutlineItems.get(uri.toString());
    }
    SetItems(uri: vscode.Uri, items: Item[]): void {
        let outlineItems = [];
        for (let item of items) {
            if (item.GetItemType() !== ItemType.Outline) {
                continue;
            }

            outlineItems.push(item as OutlineItem);
        }

        this.uri2OutlineItems.set(uri.toString(), outlineItems);
    }

    DeleteItems(element: Item): void {
        let uri = element.fileInfo.uri;
        this.uri2OutlineItems.delete(uri.toString());
    }

    async LoadParent(element: Item): Promise<Item | undefined> {
        return element.parent;
    }

    async LoadChildren(element: Item): Promise<Item[]> {
        if (element.fileInfo.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileInfo.uri;
        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineItem(element.fileInfo, element, documentSymbol);
        });

        element.children = items;

        this.uri2OutlineItems.set(element.fileInfo.uri.toString(), items);

        return items;
    }

    async LoadParents(uri: vscode.Uri): Promise<Item[] | undefined> {
        return undefined;
    }
}