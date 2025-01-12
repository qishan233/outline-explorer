import * as vscode from 'vscode';
import * as path from 'path';

import { OutlineExplorerItem, OutlineExplorerItemType, OutlineExplorerFileItem, OutlineExplorerOutlineItem } from './item';
import { ItemLoaderFactory } from './item_loader';

export interface ItemManager {
    LoadItemsInDir(element: OutlineExplorerItem): Promise<OutlineExplorerItem[]> // LoadChildren
    LoadOutlineItems(element: OutlineExplorerItem): Promise<OutlineExplorerOutlineItem[]> // LoadChildren


    LoadItemsInPath(uri: vscode.Uri): Promise<OutlineExplorerItem[]> // LoadParents
    LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<OutlineExplorerItem[] | undefined> // LoadItems

    LoadFileItem(uri: vscode.Uri): Promise<OutlineExplorerItem | undefined> // LoadItems

    LoadParentItem(element: OutlineExplorerItem): Promise<OutlineExplorerItem | undefined> //LoadParent

    DeleteItem(element: OutlineExplorerItem): void // DeleteItems

    GetFileItem(uri: vscode.Uri): OutlineExplorerFileItem | undefined // GetItems
    SetFileItem(uri: vscode.Uri, fileItem: OutlineExplorerFileItem): void // SetItems

    GetOutlineItems(uri: vscode.Uri): OutlineExplorerOutlineItem[] | undefined // GetItems
}

export class ItemManagerFactory {
    static Create(): ItemManager {
        return new ItemManagerImpl();
    }
}


class ItemManagerImpl implements ItemManager {
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
        if (!items || items.length !== 1) {
            return;
        }

        return items[0];
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