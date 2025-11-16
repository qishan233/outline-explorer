import * as vscode from 'vscode';
import { Item, ItemType, FileItem } from './item';
import * as Logger from './log';
import { ItemItemFactory } from './item_manager';

export class OutlineExplorerDataProvider implements vscode.TreeDataProvider<Item> {
    private treeDataChangedEventEmitter: vscode.EventEmitter<Item | Item[] | void | void | null | undefined> = new vscode.EventEmitter<Item[]>();
    readonly onDidChangeTreeData: vscode.Event<Item | Item[] | void | null | undefined> = this.treeDataChangedEventEmitter.event;

    private itemManager = ItemItemFactory.ItemManager();

    constructor(context: vscode.ExtensionContext) { }

    async LoadFileItem(uri: vscode.Uri): Promise<Item | undefined> {
        return this.itemManager.LoadFileItem(uri);
    }


    async Refresh(element: Item | undefined): Promise<void> {
        if (!element) {
            this.dataChanged(element);
            return;
        }

        await this.itemManager.Refresh(element);

        this.dataChanged(element);
    }

    /**
     * Expand the element
     * @param element 
     * @returns 
     */
    async ToExpand(element: Item | undefined): Promise<void> {
        if (!element) {
            return;
        }


        this.dataChanged(element);
    }

    /**
     * Collapse the element
     * @param element 
     * @returns 
     */
    async ToCollapse(element: Item | undefined): Promise<void> {

    }

    /**
     * On expand the element record the element
     * @param element 
     * @returns 
     */
    async OnDidExpand(element: Item | undefined): Promise<void> {
        if (!element) {
            return;
        }

        this.dataChanged(element);
    }

    /**
     * On collapse the element remove the element from the record
     * @param element 
     * @returns 
     */
    async OnDidCollapse(element: Item | undefined): Promise<void> {
        if (!element) {
            return;
        }

        this.dataChanged(element);
    }

    private dataChanged(item: Item | Item[] | void | null | undefined) {
        this.treeDataChangedEventEmitter.fire(item);
    }

    async AddOutlineExplorerFileItem(uri: vscode.Uri): Promise<Item | undefined> {
        let items = await this.itemManager.LoadParents(uri);

        if (items.length === 0) {
            return;
        }

        let item = items[items.length - 1];

        // update the parent's children
        if (item.parent) {
            await this.itemManager.LoadFileItemChildren(item.parent);
        }

        this.dataChanged(item.parent);

        return item;
    }

    RemoveItem(uri: vscode.Uri): Item | undefined {
        let fileItem = this.itemManager.GetItem(uri);
        if (!fileItem) {
            return;
        }

        this.itemManager.DeleteItem(fileItem);

        for (let child of fileItem.children ?? []) {
            if (child.GetItemType() === ItemType.File) {
                this.RemoveItem(child.fileInfo.uri);
            }
        }

        let parent = fileItem.parent;
        if (parent) {
            parent.children = parent.children?.filter((item: Item) => item !== fileItem);
        }

        this.dataChanged(parent);

        return fileItem;
    }

    // vscode.TreeDataProvider implementation
    getTreeItem(element: Item): vscode.TreeItem {
        return element.GetTreeItem();
    }

    // vscode.TreeDataProvider implementation
    async getParent(element: Item): Promise<Item | undefined> {
        if (!element) {
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        const uri = element.fileInfo.uri;

        let fileItems = await this.itemManager.LoadParents(uri);
        if (!fileItems || fileItems.length === 0) {
            element.parent = undefined;
        }

        return element.parent;
    }

    // vscode.TreeDataProvider implementation
    async getChildren(element?: Item): Promise<Item[]> {
        if (element) {
            return this.getChildrenOfElement(element);
        }

        return this.loadWorkspaceFolderItems();
    }

    async getChildrenOfElement(element: Item): Promise<Item[]> {
        if (element.children) {
            return element.children;
        }

        if (element.GetItemType() === ItemType.Outline) {
            return [];
        }

        if (element.GetItemType() !== ItemType.File) {
            Logger.Error('getChildren Invalid OutlineExploreItem', element);
            throw new Error('getChildren Invalid OutlineExploreItem');
        }

        let children: Item[] | undefined = undefined;

        // TODO duplicate code with Refresh
        if (element.fileInfo.type === vscode.FileType.Directory) {
            children = await this.itemManager.LoadFileItemChildren(element);
        } else {
            children = await this.itemManager.LoadOutlineItemChildren(element as FileItem);
        }

        element.children = children;

        return children;
    }

    async LoadOutlineItemsOfUri(uri: vscode.Uri): Promise<Item[] | undefined> {
        let fileItem = await this.itemManager.LoadFileItem(uri);

        if (!fileItem) {
            return undefined;
        }

        let items = await this.itemManager.LoadOutlineItemChildren(fileItem);
        if (!items || items.length === 0) {
            return;
        }

        this.dataChanged(fileItem);

        return items;
    }

    private async loadWorkspaceFolderItems(): Promise<Item[]> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return [];
        }

        let workspaceFolderItems = new Array<Item>();
        for (let workspaceFolder of workspaceFolders) {
            let workspaceFolderItem = this.itemManager.GetItem(workspaceFolder.uri);
            if (workspaceFolderItem) {
                workspaceFolderItems.push(workspaceFolderItem);
                continue;
            }

            workspaceFolderItem = new FileItem(workspaceFolder.uri, vscode.FileType.Directory);

            this.itemManager.SetItem(workspaceFolder.uri, workspaceFolderItem);

            await this.itemManager.LoadFileItemChildren(workspaceFolderItem);

            workspaceFolderItems.push(workspaceFolderItem);
        }

        return workspaceFolderItems;
    }

    async GetMatchedItemInRange(uri: vscode.Uri, selection: vscode.Selection): Promise<Item | undefined> {
        let fileItem = this.itemManager.GetItem(uri);
        if (!fileItem) {
            return;
        }

        let items = await this.itemManager.LoadOutlineItemChildren(fileItem);
        if (!items) {
            return;
        }

        for (let item of items) {
            let result = item.GetMatchedItemInRange(selection);
            if (result) {
                return result;
            }
        }

        return;
    }

}