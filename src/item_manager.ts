import * as vscode from 'vscode';
import * as path from 'path';

import { Item, ItemType, FileItem, OutlineItem } from './item';
import { GetDocumentSymbols } from './outline';
import { getFileInfosInPath, getFileInfosInDir } from './file';


interface ItemManager {
    LoadFileItem(uri: vscode.Uri): Promise<FileItem | undefined>
    LoadParents(uri: vscode.Uri): Promise<Item[]>
    LoadFileItemChildren(element: Item): Promise<FileItem[]>
    LoadOutlineItemChildren(fileItem: FileItem): Promise<OutlineItem[]>

    LoadChildren(element: Item): Promise<Item[] | undefined>

    GetItem(uri: vscode.Uri): FileItem | undefined
    SetItem(uri: vscode.Uri, items: FileItem): void
    DeleteItem(element: Item): void

    Refresh(element: Item): Promise<void>

    OnDidExpand(element: Item): Promise<void>
    OnDidCollapse(element: Item): Promise<void>
    ToExpand(element: Item | undefined, level: number): Promise<Item[]>
    ToCollapse(element: Item | undefined): Promise<Item[]>
    HasExpandedItem(): boolean
}

export class ItemItemFactory {
    static ItemManager(): ItemManager {
        return new ItemManagerImpl();
    }
}

class ItemManagerImpl implements ItemManager {
    uri2FileInfo: Map<string, FileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineItem[]> = new Map();
    workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();

    expandedItems: Set<Item> = new Set();

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // ignore the .git folder
        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async LoadFileItem(uri: vscode.Uri): Promise<FileItem | undefined> {
        let item = this.GetItem(uri);
        if (item) {
            return item;
        }

        let items = await this.LoadParents(uri);
        if (!items || items.length === 0) {
            return;
        }

        return items[items.length - 1];
    }


    GetItem(uri: vscode.Uri): FileItem | undefined {
        let item = this.uri2FileInfo.get(uri.toString());
        if (!item) {
            return undefined;
        }

        return item;
    }

    SetItem(uri: vscode.Uri, fileItem: FileItem): void {
        if (fileItem.GetItemType() !== ItemType.File) {
            return;
        }

        this.uri2FileInfo.set(uri.toString(), fileItem);
    }

    DeleteItem(element: Item): void {
        let uri = element.fileInfo.uri;
        this.uri2FileInfo.delete(uri.toString());
        this.uri2OutlineItems.delete(uri.toString());

        if (element.GetItemType() === ItemType.File && element.fileInfo.type === vscode.FileType.Directory) {
            for (let child of element.children ?? []) {
                this.DeleteItem(child);
            }
        }
    }

    async LoadFileItemChildren(element: Item): Promise<FileItem[]> {
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

    async LoadOutlineItemChildren(fileItem: FileItem): Promise<OutlineItem[]> {
        if (fileItem.fileInfo.type !== vscode.FileType.File) {
            return [];
        }

        const uri = fileItem.fileInfo.uri;
        const fileInfo = fileItem.fileInfo;
        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineItem(fileInfo, fileItem, documentSymbol);
        });

        fileItem.children = items;

        this.uri2OutlineItems.set(fileInfo.uri.toString(), items);

        return items;
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

    async LoadParents(uri: vscode.Uri): Promise<FileItem[]> {
        let fileInfoInPath = await getFileInfosInPath(uri);
        if (!fileInfoInPath) {
            return [];
        }

        let fileInfos: FileItem[] = [];
        for (let i = 0; i < fileInfoInPath.length; i++) {
            const fileInfo = fileInfoInPath[i];

            let existFileInfo = this.uri2FileInfo.get(fileInfo.uri.toString());
            if (existFileInfo) {
                fileInfos.push(existFileInfo);
                continue;
            }

            let item = new FileItem(fileInfo.uri, fileInfo.type);
            item.parent = i === 0 ? undefined : fileInfos[i - 1];

            fileInfos.push(item);
        }

        for (let item of fileInfos) {
            this.uri2FileInfo.set(item.fileInfo.uri.toString(), item);
        }

        return fileInfos;
    }

    async Refresh(element: Item): Promise<void> {
        this.DeleteItem(element);

        if (element.GetItemType() !== ItemType.File) {
            return;
        }

        let children = await this.LoadChildren(element);
        element.children = children;
    }

    async LoadChildren(element: Item): Promise<Item[] | undefined> {
        if (element.GetItemType() === ItemType.Outline) {
            return element.children;
        }

        if (element.fileInfo.type === vscode.FileType.Directory) {
            return await this.LoadFileItemChildren(element as FileItem);
        } else if (element.fileInfo.type === vscode.FileType.File) {
            return await this.LoadOutlineItemChildren(element as FileItem);
        }

        return [];
    }

    async ToExpand(item: Item | undefined, level: number = 0): Promise<Item[]> {
        if (level <= 0 || !item) {
            return [];
        }

        let affectedItems: Item[] = [];

        await item.SetCollapsibleState(vscode.TreeItemCollapsibleState.Expanded);
        this.expandedItems.add(item);
        affectedItems.push(item);

        if (!item.children) {
            let children = await this.LoadChildren(item);
            item.children = children;
        }

        for (let child of item.children ?? []) {
            if (!this.expandedItems.has(child)) {
                if (child.GetItemType() === ItemType.File) {
                    let childAffectedItems = await this.ToExpand(child, level - 1);
                    affectedItems.push(...childAffectedItems);
                } else {
                    let childAffectedItems = await this.ToExpand(child, level);
                    affectedItems.push(...childAffectedItems);
                }
            }
        }

        return affectedItems;
    }

    async ToCollapse(item: Item | undefined): Promise<Item[]> {
        let affectedItems: Item[] = [];

        if (item) {
            this.expandedItems.delete(item);
            item.SetCollapsibleState(vscode.TreeItemCollapsibleState.Collapsed);
            affectedItems.push(item);

            for (let child of item.children ?? []) {
                if (this.expandedItems.has(child)) {
                    let childAffectedItems = await this.ToCollapse(child);
                    affectedItems.push(...childAffectedItems);
                }

            }

            return affectedItems;
        }

        for (let expandedItem of Array.from(this.expandedItems)) {
            if (this.expandedItems.has(expandedItem)) {
                let childAffectedItems = await this.ToCollapse(expandedItem);
                affectedItems.push(...childAffectedItems);
            }
        }

        return affectedItems;
    }

    async OnDidExpand(item: Item): Promise<void> {
        this.expandedItems.add(item);
    }

    async OnDidCollapse(item: Item): Promise<void> {
        this.expandedItems.delete(item);
    }

    HasExpandedItem(): boolean {
        return this.expandedItems.size > 0;
    }

}