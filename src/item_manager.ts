import * as vscode from 'vscode';
import * as path from 'path';

import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem } from './item';
import { GetDocumentSymbols, SymbolKind2IconId, getParentsOfDocumentSymbol, OutlineItem } from './outline';
import { FileItem, getFileItemsInPath, getFileItemsInDir } from './file';

export interface ItemManager {
    LoadItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]>
    LoadItemsInPath(uri: vscode.Uri): Promise<OutlineExplorerFileItem[]>
    LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]>
    LoadParentItem(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined>
}

export class ItemManagerFactory {
    static Create(): ItemManager {
        return new ItemManagerImpl();
    }
}


class ItemManagerImpl implements ItemManager {
    uri2FileItem: Map<string, OutlineExplorerFileItem> = new Map();
    uri2OutlineItems: Map<string, OutlineExplorerOutlineItem[]> = new Map();
    workspaceFolder2IgnoreUris: Map<string, vscode.Uri[]> = new Map();


    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // ignore the .git folder
        for (let folder of workspaceFolders) {
            let gitIgnoreUri = vscode.Uri.file(path.join(folder.uri.fsPath, '.git'));
            this.workspaceFolder2IgnoreUris.set(folder.uri.toString(), [gitIgnoreUri]);
        }

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

    async LoadItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
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

    async LoadItemsInPath(uri: vscode.Uri): Promise<OutlineExplorerFileItem[]> {
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

    async LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> {
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

    async LoadParentItem(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (element.GetItemType() === OutlineExplorerItemType.File) {
            return this.loadParentOfFileItem(element as OutlineExplorerFileItem);
        }

        if (element.GetItemType() === OutlineExplorerItemType.Outline) {
            return this.loadParentOfOutlineItem(element as OutlineExplorerOutlineItem);
        }


        return undefined;
    }

    private async loadParentOfFileItem(element: OutlineExplorerFileItem): Promise<OutlineExplorerItem | undefined> {
        const uri = element.fileItem.uri;
        let fileItems = await this.LoadItemsInPath(uri);
        if (!fileItems || fileItems.length === 0) {
            element.parent = undefined;
        }

        return element.parent;

    }

    private async loadParentOfOutlineItem(element: OutlineExplorerOutlineItem): Promise<OutlineExplorerItem | undefined> {
        const targetOutlineItem = element.outlineItem;
        let outlineExplorerItems = this.uri2OutlineItems.get(element.fileItem.uri.toString());

        if (!outlineExplorerItems) {
            return undefined;
        }

        const outlineItems = outlineExplorerItems.map(item => item.outlineItem).filter(item => item !== undefined);

        const parents = getParentsOfDocumentSymbol(outlineItems, targetOutlineItem.documentSymbol);
        if (!parents) {
            return undefined;
        }

        let parent: OutlineExplorerItem | undefined = undefined;

        if (parents.length === 0) {
            let fileItems = await this.LoadItemsInPath(element.fileItem.uri);
            if (fileItems.length !== 0) {
                parent = fileItems[fileItems.length - 1];
            }
        } else {
            const parentOutlineItem = parents[parents.length - 1];
            parent = outlineExplorerItems.find(item => {
                if (!item.outlineItem) {
                    return false;
                }
                return item.outlineItem === parentOutlineItem;
            });
        }

        element.parent = parent;

        return parent;
    }
}