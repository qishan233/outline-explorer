import * as vscode from 'vscode';
import * as path from 'path';

import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem } from './item';
import { GetDocumentSymbols, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileItemsInPath, getFileItemsInDir } from './file';


interface ItemLoader {
    LoadItems(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined>
    GetItems(uri: vscode.Uri): OutlineExplorerItem[] | undefined
    SetItems(uri: vscode.Uri, items: OutlineExplorerItem[]): void

    DeleteItems(element: OutlineExplorerItem): void

    LoadParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined>
    LoadChildren(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]>

    LoadParents(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined>
}

interface FileItemLoader extends ItemLoader {
}

export class ItemLoaderFactory {
    static FileItemLoader(): FileItemLoader {
        return new FileItemLoaderImpl();
    }

    static OutlineItemLoader(fileItemLoader: FileItemLoader): ItemLoader {
        return new OutlineItemLoader(fileItemLoader);
    }
}

class FileItemLoaderImpl implements FileItemLoader {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // ignore the .git folder
        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }
    }

    async LoadItems(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
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


    GetItems(uri: vscode.Uri): OutlineExplorerItem[] | undefined {
        let item = this.uri2FileItem.get(uri.toString());
        if (!item) {
            return undefined;
        }

        return [item];
    }

    SetItems(uri: vscode.Uri, items: OutlineExplorerItem[]): void {
        if (items.length !== 1) {
            return;
        }

        const fileItem = items[0];
        if (fileItem.GetItemType() !== OutlineExplorerItemType.File) {
            return;
        }

        this.uri2FileItem.set(uri.toString(), fileItem as OutlineExplorerFileItem);
    }

    DeleteItems(element: OutlineExplorerItem): void {
        let uri = element.fileItem.uri;
        this.uri2FileItem.delete(uri.toString());

        if (element.GetItemType() === OutlineExplorerItemType.File && element.fileItem.type === vscode.FileType.Directory) {
            for (let child of element.children ?? []) {
                this.DeleteItems(child);
            }
        }
    }

    async LoadParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        const uri = element.fileItem.uri;

        let fileItems = await this.LoadParents(uri);
        if (!fileItems || fileItems.length === 0) {
            element.parent = undefined;
        }

        return element.parent;
    }

    async LoadChildren(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        let uri = element.fileItem.uri;

        let fileItems = await getFileItemsInDir(uri, this.getIgnoredUris(uri));

        const outlineExplorerFileItems = fileItems.map(fileItem => {
            let item = this.uri2FileItem.get(fileItem.uri.toString());

            if (!item) {
                item = new OutlineExplorerFileItem(fileItem.uri, fileItem.type);
            }

            item.parent = element;

            return item;
        });

        for (let item of outlineExplorerFileItems) {
            this.uri2FileItem.set(item.fileItem.uri.toString(), item);
        }

        element.children = outlineExplorerFileItems;

        return outlineExplorerFileItems;
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

    async LoadParents(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        let fileItemsInPath = await getFileItemsInPath(uri);
        if (!fileItemsInPath) {
            return [];
        }

        let outlineExplorerFileItems: OutlineExplorerFileItem[] = [];
        for (let i = 0; i < fileItemsInPath.length; i++) {
            const fileItem = fileItemsInPath[i];

            let existFileItem = this.uri2FileItem.get(fileItem.uri.toString());
            if (existFileItem) {
                outlineExplorerFileItems.push(existFileItem);
                continue;
            }

            let item = new OutlineExplorerFileItem(fileItem.uri, fileItem.type);
            item.parent = i === 0 ? undefined : outlineExplorerFileItems[i - 1];

            outlineExplorerFileItems.push(item);
        }

        for (let item of outlineExplorerFileItems) {
            this.uri2FileItem.set(item.fileItem.uri.toString(), item);
        }

        return outlineExplorerFileItems;
    }
}


class OutlineItemLoader implements ItemLoader {
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
    fileItemLoader: ItemLoader;

    constructor(fileItemLoader: ItemLoader) {
        this.fileItemLoader = fileItemLoader;
    }

    async LoadItems(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        let elements = await this.fileItemLoader.LoadItems(uri);
        if (!elements || elements.length === 0) {
            return;
        }

        let element = elements[0];

        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineExplorerOutlineItem(element.fileItem, element, documentSymbol);
        });

        element.children = items;

        this.uri2OutlineItems.set(element.fileItem.uri.toString(), items);

        return items;

    }
    GetItems(uri: vscode.Uri): OutlineExplorerItem[] | undefined {
        return this.uri2OutlineItems.get(uri.toString());
    }
    SetItems(uri: vscode.Uri, items: OutlineExplorerItem[]): void {
        let outlineItems = [];
        for (let item of items) {
            if (item.GetItemType() !== OutlineExplorerItemType.Outline) {
                continue;
            }

            outlineItems.push(item as OutlineExplorerOutlineItem);
        }

        this.uri2OutlineItems.set(uri.toString(), outlineItems);
    }

    DeleteItems(element: OutlineExplorerItem): void {
        let uri = element.fileItem.uri;
        this.uri2OutlineItems.delete(uri.toString());
    }

    async LoadParent(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        return element.parent;
    }

    async LoadChildren(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        if (element.fileItem.type !== vscode.FileType.File) {
            return [];
        }

        const uri = element.fileItem.uri;
        const outlineItems = await GetDocumentSymbols(uri);
        let items = outlineItems.map(documentSymbol => {
            return new OutlineExplorerOutlineItem(element.fileItem, element, documentSymbol);
        });

        element.children = items;

        this.uri2OutlineItems.set(element.fileItem.uri.toString(), items);

        return items;
    }

    async LoadParents(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        return undefined;
    }
}