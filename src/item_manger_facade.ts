import * as vscode from 'vscode';

import { Item, ItemType, FileItem, OutlineItem } from './item';
import { ItemItemFactory } from './item_manager';

export interface ItemManagerFacade {
    LoadItemsInDir(element: Item): Promise<FileItem[]>
    LoadOutlineItems(fileItem: FileItem): Promise<OutlineItem[]>

    LoadItemsInPath(uri: vscode.Uri): Promise<Item[]>
    LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined>

    LoadFileItem(uri: vscode.Uri): Promise<FileItem | undefined>

    LoadParentItem(element: Item): Promise<Item | undefined>

    DeleteItem(element: Item): void

    GetFileItem(uri: vscode.Uri): FileItem | undefined
    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void
}

export class ItemManagerFacadeFactory {
    static Create(): ItemManagerFacade {
        return new ItemMangerFacadeImpl();
    }
}


class ItemMangerFacadeImpl implements ItemManagerFacade {
    itemManager = ItemItemFactory.ItemManager();

    constructor() {
    }

    SetFileItem(uri: vscode.Uri, fileItem: FileItem): void {
        this.itemManager.SetItem(uri, fileItem);
    }

    GetFileItem(uri: vscode.Uri): FileItem | undefined {
        let item = this.itemManager.GetItem(uri);
        if (item) {
            return item as FileItem;
        }

        return undefined;
    }

    async LoadFileItem(uri: vscode.Uri): Promise<FileItem | undefined> {
        return this.itemManager.LoadItem(uri);
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined> {
        let fileItem = await this.LoadFileItem(uri);

        if (!fileItem) {
            return undefined;
        }

        return this.itemManager.LoadOutlineItems(fileItem as FileItem);
    }

    DeleteItem(element: Item): void {
        this.itemManager.DeleteItem(element);
    }


    async LoadItemsInDir(element: Item): Promise<FileItem[]> {
        return this.itemManager.LoadChildren(element);
    }

    async LoadItemsInPath(uri: vscode.Uri): Promise<Item[]> {
        return this.itemManager.LoadParents(uri);
    }

    async LoadOutlineItems(fileItem: FileItem): Promise<OutlineItem[]> {
        return this.itemManager.LoadOutlineItems(fileItem);
    }

    async LoadParentItem(element: Item): Promise<Item | undefined> {
        if (element.GetItemType() === ItemType.File) {
            return this.itemManager.LoadParent(element);
        }

        if (element.GetItemType() === ItemType.Outline) {
            return element.parent;
        }

        return undefined;
    }

}