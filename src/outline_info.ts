import * as vscode from 'vscode';

export async function GetOutline(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
    if (!uri) {
        if (vscode.window.activeTextEditor) {
            uri = vscode.window.activeTextEditor.document.uri;
        } else {
            vscode.window.showErrorMessage('No active editor');
            return new Promise<vscode.DocumentSymbol[]>(() => []);
        }
    }

    let results = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);

    if (!results) {
        vscode.window.showInformationMessage('No symbols found,' + uri.toString());
        return [];
    }

    return results;
}

export const SymbolKind2IconId = new Map<vscode.SymbolKind, string>([
    [vscode.SymbolKind.File, 'symbol-file'],
    [vscode.SymbolKind.Module, 'symbol-module'],
    [vscode.SymbolKind.Namespace, 'symbol-namespace'],
    [vscode.SymbolKind.Package, '	symbol-package'],
    [vscode.SymbolKind.Class, 'symbol-class'],
    [vscode.SymbolKind.Method, 'symbol-method'],
    [vscode.SymbolKind.Property, 'symbol-property'],
    [vscode.SymbolKind.Field, 'symbol-field'],
    [vscode.SymbolKind.Constructor, 'symbol-constructor'],
    [vscode.SymbolKind.Enum, 'symbol-enum'],
    [vscode.SymbolKind.Interface, 'symbol-interface'],
    [vscode.SymbolKind.Function, 'symbol-function'],
    [vscode.SymbolKind.Variable, 'symbol-variable'],
    [vscode.SymbolKind.Constant, 'symbol-constant'],
    [vscode.SymbolKind.String, 'symbol-string'],
    [vscode.SymbolKind.Number, 'symbol-number'],
    [vscode.SymbolKind.Boolean, 'symbol-boolean'],
    [vscode.SymbolKind.Array, 'symbol-array'],
    [vscode.SymbolKind.Object, 'symbol-object'],
    [vscode.SymbolKind.Key, 'symbol-key'],
    [vscode.SymbolKind.Null, 'symbol-null'],
    [vscode.SymbolKind.EnumMember, 'symbol-enum-member'],
    [vscode.SymbolKind.Struct, 'symbol-struct'],
    [vscode.SymbolKind.Event, 'symbol-event'],
    [vscode.SymbolKind.Operator, 'symbol-operator'],
    [vscode.SymbolKind.TypeParameter, 'symbol-type-parameter']
]);

export interface OutlineEntry {
    documentSymbol: vscode.DocumentSymbol;
}

function isDocumentSymbolEqual(a: vscode.DocumentSymbol, b: vscode.DocumentSymbol): boolean {
    return a.name === b.name
        && a.detail === b.detail
        && a.kind === b.kind
        && a.range.isEqual(b.range)
        && a.selectionRange.isEqual(b.selectionRange);
}

export function getParentsOfDocumentSymbol(entries: OutlineEntry[], targetDocumentSymbol: vscode.DocumentSymbol): OutlineEntry[] | undefined {
    for (let entry of entries) {
        if (isDocumentSymbolEqual(entry.documentSymbol, targetDocumentSymbol)) {
            return [];
        }

        if (entry.documentSymbol.children) {
            let parents = getParentsOfDocumentSymbol(entry.documentSymbol.children.map(child => ({ documentSymbol: child })), targetDocumentSymbol);
            if (parents) {
                return [entry, ...parents];
            }
        }
    }

    return undefined;
}

export class OutlineTreeDataProvider implements vscode.TreeDataProvider<OutlineEntry> {
    constructor() {
        vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
        vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
        vscode.window.onDidChangeVisibleTextEditors(() => this.onVisibleEditorsChanged());

        this.onActiveEditorChanged();
    }

    private _onDidChangeTreeData: vscode.EventEmitter<OutlineEntry | undefined> = new vscode.EventEmitter<OutlineEntry>();
    readonly onDidChangeTreeData: vscode.Event<OutlineEntry | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: OutlineEntry): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.documentSymbol.name);
        if (element.documentSymbol.children?.length > 0) {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        treeItem.iconPath = new vscode.ThemeIcon(SymbolKind2IconId.get(element.documentSymbol.kind) || 'symbol-property');
        treeItem.description = element.documentSymbol.detail;
        treeItem.command = {
            command: 'outline-explorer.provider-item-clicked',
            title: 'Click Item',
            arguments: [element]
        };

        return treeItem;
    }

    async onclick(item: OutlineEntry) {
        console.log("发生点击事件:", item);
        if (!item) {
            console.log("item 为空");
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;

        if (activeEditor) {
            let position = item.documentSymbol.selectionRange.start;
            activeEditor.selection = new vscode.Selection(position, position);

            const range = new vscode.Range(item.documentSymbol.selectionRange.start, item.documentSymbol.selectionRange.start);
            activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);

            await vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn);

            return;
        }
    }

    async getChildren(element?: OutlineEntry): Promise<OutlineEntry[]> {
        if (element) {
            const children = element.documentSymbol.children || [];
            return Promise.resolve(children.map(child => {
                return { documentSymbol: child };
            }));
        } else {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const outline = await GetOutline(editor.document.uri);
                return outline.map(documentSymbol => ({ documentSymbol }));
            } else {
                return Promise.resolve([]);
            }
        }
    }

    private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
        console.log("Outline Explorer onDocumentChanged");
        if (vscode.window.activeTextEditor && changeEvent.document === vscode.window.activeTextEditor.document) {
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    private onActiveEditorChanged(): void {
        // console.log("Outline Explorer onActiveEditorChanged");
        // this._onDidChangeTreeData.fire(undefined);
    }

    private onVisibleEditorsChanged(): void {
        // console.log("Outline Explorer onVisibleEditorsChanged");
        // this._onDidChangeTreeData.fire(undefined);
    }

    private onVisibleRangesChanged(): void {
        console.log("Outline Explorer onVisibleRangesChanged");
    }

    private onSelectionChanged(): void {
        console.log("Outline Explorer onSelectionChanged");
    }
}