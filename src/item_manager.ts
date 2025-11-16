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

    GetItem(uri: vscode.Uri): FileItem | undefined
    SetItem(uri: vscode.Uri, items: Item): void
    DeleteItem(element: Item): void

    Refresh(element: Item): Promise<void>
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

    SetItem(uri: vscode.Uri, fileItem: Item): void {
        if (fileItem.GetItemType() !== ItemType.File) {
            return;
        }

        this.uri2FileInfo.set(uri.toString(), fileItem as FileItem);
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

        let fileItem = element as FileItem;

        if (fileItem.fileInfo.type === vscode.FileType.Directory) {
            await this.LoadFileItemChildren(fileItem);
        } else if (element.fileInfo.type === vscode.FileType.File) {
            await this.LoadOutlineItemChildren(fileItem);
        }
    }
}