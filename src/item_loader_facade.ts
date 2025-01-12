import * as vscode from 'vscode';

import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem } from './item';
import { ItemLoaderFactory } from './item_loader';

export interface ItemLoaderFacade {
    LoadItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]>
    LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]>


    LoadItemsInPath(uri: vscode.Uri): Promise<OutlineExplorerItem[]>
    LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined>

    LoadFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined>

    LoadParentItem(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined>

    DeleteItem(element: OutlineExplorerItem): void

    GetFileItem(uri: vscode.Uri): OutlineExplorerFileItem | undefined
    SetFileItem(uri: vscode.Uri, fileItem: OutlineExplorerFileItem): void

    GetOutlineItems(uri: vscode.Uri): OutlineExplorerOutlineItem[] | undefined
}

export class ItemLoaderFacadeFactory {
    static Create(): ItemLoaderFacade {
        return new ItemLoaderFacadeImpl();
    }
}


class ItemLoaderFacadeImpl implements ItemLoaderFacade {
    fileItemLoader = ItemLoaderFactory.FileItemLoader();
    outlineItemLoader = ItemLoaderFactory.OutlineItemLoader(this.fileItemLoader);

    constructor() {
    }

    SetFileItem(uri: vscode.Uri, fileItem: OutlineExplorerFileItem): void {
        this.fileItemLoader.SetItems(uri, [fileItem]);
    }

    GetFileItem(uri: vscode.Uri): OutlineExplorerFileItem | undefined {
        let items = this.fileItemLoader.GetItems(uri);
        if (items && items.length === 1) {
            return items[0] as OutlineExplorerFileItem;
        }

        return undefined;
    }

    async LoadFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> {
        let items = await this.fileItemLoader.LoadItems(uri);
        if (!items || items.length === 0) {
            return;
        }

        return items[items.length - 1];
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> {
        return this.outlineItemLoader.LoadItems(uri);
    }

    GetOutlineItems(uri: vscode.Uri): OutlineExplorerOutlineItem[] | undefined {
        let items = this.outlineItemLoader.GetItems(uri);
        if (!items) {
            return;
        }

        let result = [];

        for (let item of items) {
            if (item.GetItemType() === OutlineExplorerItemType.Outline) {
                result.push(item as OutlineExplorerOutlineItem);
            }
        }

        return result;
    }

    DeleteItem(element: OutlineExplorerItem): void {
        this.fileItemLoader.DeleteItems(element);

        this.outlineItemLoader.DeleteItems(element);
    }


    async LoadItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> {
        return this.fileItemLoader.LoadChildren(element);
    }

    async LoadItemsInPath(uri: vscode.Uri): Promise<OutlineExplorerItem[]> {
        let items = await this.fileItemLoader.LoadParents(uri);
        if (!items) {
            return [];
        }

        let result = [];
        for (let item of items) {
            if (item.GetItemType() === OutlineExplorerItemType.File) {
                result.push(item as OutlineExplorerFileItem);
            }
        }

        return result;
    }

    async LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> {
        let items = await this.outlineItemLoader.LoadChildren(element);
        if (!items) {
            return [];
        }

        let result = [];
        for (let item of items) {
            if (item.GetItemType() === OutlineExplorerItemType.Outline) {
                result.push(item as OutlineExplorerOutlineItem);
            }
        }

        return result;
    }

    async LoadParentItem(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> {
        if (element.GetItemType() === OutlineExplorerItemType.File) {
            return this.fileItemLoader.LoadParent(element);
        }

        if (element.GetItemType() === OutlineExplorerItemType.Outline) {
            return this.outlineItemLoader.LoadParent(element);
        }

        return undefined;
    }

}