import * as vscode from 'vscode';

import { Item, ItemType, FileItem, OutlineItem } from './item';
import { ItemLoaderFactory } from './item_loader';

export interface ItemLoaderFacade {
    LoadItemsInDir(element: Item): Promise<Item[]>
    LoadOutlineItems(element: Item): Promise<OutlineItem[]>


    LoadItemsInPath(uri: vscode.Uri): Promise<Item[]>
    LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined>

    LoadFileItem(uri: vscode.Uri): Promise<Item | undefined>

    LoadParentItem(element: Item): Promise<Item | undefined>

    DeleteItem(element: Item): void

    GetFileItem(uri: vscode.Uri): FileItem | undefined
    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void

    GetOutlineItems(uri: vscode.Uri): OutlineItem[] | undefined
}

export class ItemLoaderFacadeFactory {
    static Create(): ItemLoaderFacade {
        return new ItemLoaderFacadeImpl();
    }
}


class ItemLoaderFacadeImpl implements ItemLoaderFacade {
    fileItemLoader = ItemLoaderFactory.FileInfoLoader();
    outlineItemLoader = ItemLoaderFactory.OutlineItemLoader(this.fileItemLoader);

    constructor() {
    }

    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void {
        this.fileItemLoader.SetItems(uri, [fileItem]);
    }

    GetFileItem(uri: vscode.Uri): FileItem | undefined {
        let items = this.fileItemLoader.GetItems(uri);
        if (items && items.length === 1) {
            return items[0] as FileItem;
        }

        return undefined;
    }

    async LoadFileItem(uri: vscode.Uri): Promise<Item | undefined> {
        let items = await this.fileItemLoader.LoadItems(uri);
        if (!items || items.length === 0) {
            return;
        }

        return items[items.length - 1];
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined> {
        return this.outlineItemLoader.LoadItems(uri);
    }

    GetOutlineItems(uri: vscode.Uri): OutlineItem[] | undefined {
        let items = this.outlineItemLoader.GetItems(uri);
        if (!items) {
            return;
        }

        let result = [];

        for (let item of items) {
            if (item.GetItemType() === ItemType.Outline) {
                result.push(item as OutlineItem);
            }
        }

        return result;
    }

    DeleteItem(element: Item): void {
        this.fileItemLoader.DeleteItems(element);

        this.outlineItemLoader.DeleteItems(element);
    }


    async LoadItemsInDir(element: Item): Promise<Item[]> {
        return this.fileItemLoader.LoadChildren(element);
    }

    async LoadItemsInPath(uri: vscode.Uri): Promise<Item[]> {
        let items = await this.fileItemLoader.LoadParents(uri);
        if (!items) {
            return [];
        }

        let result = [];
        for (let item of items) {
            if (item.GetItemType() === ItemType.File) {
                result.push(item as FileItem);
            }
        }

        return result;
    }

    async LoadOutlineItems(element: Item): Promise<OutlineItem[]> {
        let items = await this.outlineItemLoader.LoadChildren(element);
        if (!items) {
            return [];
        }

        let result = [];
        for (let item of items) {
            if (item.GetItemType() === ItemType.Outline) {
                result.push(item as OutlineItem);
            }
        }

        return result;
    }

    async LoadParentItem(element: Item): Promise<Item | undefined> {
        if (element.GetItemType() === ItemType.File) {
            return this.fileItemLoader.LoadParent(element);
        }

        if (element.GetItemType() === ItemType.Outline) {
            return this.outlineItemLoader.LoadParent(element);
        }

        return undefined;
    }

}