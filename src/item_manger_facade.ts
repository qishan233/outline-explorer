import * as vscode from 'vscode';

import { Item, ItemType, FileItem, OutlineItem } from './item';
import { ItemItemFactory } from './item_manager';

export interface ItemManager {
    LoadItemsInDir(element: Item): Promise<Item[]>
    LoadOutlineItems(element: Item): Promise<OutlineItem[]>


    LoadItemsInPath(uri: vscode.Uri): Promise<Item[]>
    LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined>

    LoadFileItem(uri: vscode.Uri): Promise<Item | undefined>

    LoadParentItem(element: Item): Promise<Item | undefined>

    DeleteItem(element: Item): void

    GetFileItem(uri: vscode.Uri): FileItem | undefined
    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void
}

export class ItemManagerFactory {
    static Create(): ItemManager {
        return new ItemMangerFacadeImpl();
    }
}


class ItemMangerFacadeImpl implements ItemManager {
    fileItemManager = ItemItemFactory.FileItemManager();
    outlineItemManager = ItemItemFactory.OutlineItemManager(this.fileItemManager);

    constructor() {
    }

    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void {
        this.fileItemManager.SetItems(uri, [fileItem]);
    }

    GetFileItem(uri: vscode.Uri): FileItem | undefined {
        let items = this.fileItemManager.GetItems(uri);
        if (items && items.length === 1) {
            return items[0] as FileItem;
        }

        return undefined;
    }

    async LoadFileItem(uri: vscode.Uri): Promise<Item | undefined> {
        let items = await this.fileItemManager.LoadItems(uri);
        if (!items || items.length === 0) {
            return;
        }

        return items[items.length - 1];
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined> {
        return this.outlineItemManager.LoadItems(uri);
    }

    DeleteItem(element: Item): void {
        this.fileItemManager.DeleteItems(element);

        this.outlineItemManager.DeleteItems(element);
    }


    async LoadItemsInDir(element: Item): Promise<Item[]> {
        return this.fileItemManager.LoadChildren(element);
    }

    async LoadItemsInPath(uri: vscode.Uri): Promise<Item[]> {
        let items = await this.fileItemManager.LoadParents(uri);
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
        let items = await this.outlineItemManager.LoadChildren(element);
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
            return this.fileItemManager.LoadParent(element);
        }

        if (element.GetItemType() === ItemType.Outline) {
            return this.outlineItemManager.LoadParent(element);
        }

        return undefined;
    }

}