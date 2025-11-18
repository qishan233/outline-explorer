import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import * as eventHandler from './listener';
import { Item, ItemType } from './item';
import { OutlineExplorerDataProvider } from './item_data_provider';
import * as config from './config';

const FirstRevealDelayTime = 1000;
const localize = nls.loadMessageBundle();

export class OutlineExplorerTreeView {
    private treeView: vscode.TreeView<Item>;
    private dataProvider: OutlineExplorerDataProvider;


    private treeViewVisible = false;
    private ignoreActiveEditorChange = false;

    private treeViewVisibleChanged = false;

    constructor(context: vscode.ExtensionContext) {
        // 注册树视图
        this.dataProvider = new OutlineExplorerDataProvider();
        this.treeView = vscode.window.createTreeView('outline-explorer', { treeDataProvider: this.dataProvider });

        // 注册 tree view
        context.subscriptions.push(this.treeView);

        // 注册命令
        this.registerCommands(context);

        // 注册树视图事件处理程序
        this.registerTreeViewEventHandlers();

        // 注册 VSCode 事件处理程序
        this.registerVSCodeEventHandlers();

        // 监听配置变更
        this.watchConfigurationChanges(context);

        // 初始化
        this.Init();
    }

    watchConfigurationChanges(context: vscode.ExtensionContext): void {
        config.Init(context);

        config.UnsupportedFileExtConfigChangedEvent(e => {
            this.OnUnsupportedFileExtensionsChanged(e);
        });
    }

    registerVSCodeEventHandlers(): void {
        const em = eventHandler.GlobalVSCodeEventHandlerManager;

        em.RegisterTextDocumentChangedEventHandler(this);
        em.RegisterActiveTextEditorChangedEventHandler(this);
        em.RegisterTextEditorSelectionChangedEventHandler(this);
        em.RegisterWorkspaceFoldersChangedEventHandler(this);
        em.RegisterRenameFilesEventHandler(this);
        em.RegisterCreateFilesEventHandler(this);
        em.RegisterDeleteFilesEventHandler(this);
    }

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.item-clicked', async (item) => {
            await this.OnClick(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.refresh', (item) => {
            this.Refresh(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.expand-1-level', async () => {
            await this.ToExpand(undefined);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.expand-2-levels', async (item) => {
            await this.ToExpand(item);
        }, this));
        context.subscriptions.push(vscode.commands.registerCommand('outline-explorer.collapse-all', async (item) => {
            await this.ToCollapse(item);
        }, this));
    }

    registerTreeViewEventHandlers(): void {
        this.treeView.onDidChangeVisibility(e => this.OnVisibilityChanged(e));

        this.treeView.onDidCollapseElement(e => this.OnDidCollapse(e));

        this.treeView.onDidExpandElement(e => this.OnDidExpand(e));
    }

    Init() {
        setTimeout(async () => {
            await this.revealActiveTextEditor();
        }, FirstRevealDelayTime);

        this.dataProvider.UpdateGlobalCollapseState();
    }

    Dispose() {
        this.treeView.dispose();
    }

    OnVisibilityChanged(e: vscode.TreeViewVisibilityChangeEvent) {
        this.treeViewVisible = e.visible;
        if (this.treeViewVisible && this.treeViewVisibleChanged) {
            this.revealActiveTextEditor();
        }

        this.treeViewVisibleChanged = true;
    }

    OnUnsupportedFileExtensionsChanged(e: config.UnsupportedFileExtChangeEvent) {
        this.dataProvider.Reset();

        this.dataProvider.Refresh(undefined).then(() => {
            this.revealActiveTextEditor();
        });
    }

    async OnRenameFiles(event: vscode.FileRenameEvent) {
        for (let file of event.files) {
            this.dataProvider.RemoveItem(file.oldUri);

            await this.dataProvider.AddOutlineExplorerFileItem(file.newUri);
        }
    }

    async OnCreateFiles(event: vscode.FileCreateEvent) {
        for (let file of event.files) {
            await this.dataProvider.AddOutlineExplorerFileItem(file);
        }
    }

    OnDeleteFiles(event: vscode.FileDeleteEvent) {
        for (let file of event.files) {
            this.dataProvider.RemoveItem(file);
        }
    }

    async OnTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {
        if (!this.treeViewVisible) {
            return;
        }

        if (!e.kind) {
            return;
        }

        const selection = e.selections[0];
        if (selection.isEmpty) {
            return;
        }

        let item = await this.dataProvider.GetMatchedItemInRange(e.textEditor.document.uri, selection);
        if (!item) {
            return;
        }

        this.treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true
        });
    }

    async OnTextDocumentChanged(e: vscode.TextDocumentChangeEvent) {
        await this.dataProvider.LoadOutlineItemsOfUri(e.document.uri);
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
        // only handle the removed folders, the added folders will be handled by dataProvider.getChildren
        for (let removed of event.removed) {
            this.dataProvider.RemoveItem(removed.uri);
        }
    }

    async OnActiveTextEditorChanged(e: vscode.TextEditor | undefined) {
        if (!e) {
            return;
        }

        if (this.ignoreActiveEditorChange) {
            this.ignoreActiveEditorChange = false;
            return;
        }

        await this.RevealUri(e.document.uri);
    }

    async OnClick(item: Item) {
        if (!item) {
            return;
        }

        // outlineItem.onClick() may change the active editor, at this time, the global event handler won't need to handle the active editor change event
        if (item.GetItemType() === ItemType.Outline) {
            this.ignoreActiveEditorChange = true;
        }

        item.OnClick();

        return;
    }

    async RevealUri(uri: vscode.Uri) {
        if (!this.treeViewVisible) {
            return;
        }

        let item = await this.dataProvider.LoadFileItem(uri);
        if (!item) {
            return;
        }

        this.treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true,
        });
    }

    async Refresh(element: Item | undefined): Promise<void> {
        await this.dataProvider.Refresh(element);

        if (!element) {
            return;
        }

        this.treeView.reveal(element, {
            select: true,
            focus: false,
            expand: true
        });
    }

    async ToExpand(item: Item | undefined): Promise<void> {
        this.dataProvider.ToExpand(item);
    }

    async ToCollapse(item: Item | undefined): Promise<void> {
        this.dataProvider.ToCollapse(item);
    }

    async OnDidExpand(e: vscode.TreeViewExpansionEvent<Item>): Promise<void> {
        this.dataProvider.OnDidExpand(e.element);
    }

    async OnDidCollapse(e: vscode.TreeViewExpansionEvent<Item>): Promise<void> {
        this.dataProvider.OnDidCollapse(e.element);
    }


    async revealActiveTextEditor() {
        let activeEditor = vscode.window.activeTextEditor;
        let workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (activeEditor) {
            await this.RevealUri(activeEditor.document.uri);
        } else if (workspaceFolder) {
            await this.RevealUri(workspaceFolder.uri);
        }
    }
}
