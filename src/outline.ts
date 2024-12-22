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


export class OutlineItem {
    documentSymbol: vscode.DocumentSymbol;
    constructor(documentSymbol: vscode.DocumentSymbol) {
        this.documentSymbol = documentSymbol;
    }
}


function isDocumentSymbolEqual(a: vscode.DocumentSymbol, b: vscode.DocumentSymbol): boolean {
    return a.name === b.name
        && a.detail === b.detail
        && a.kind === b.kind
        && a.range.isEqual(b.range)
        && a.selectionRange.isEqual(b.selectionRange);
}

export function getParentsOfDocumentSymbol(entries: OutlineItem[], targetDocumentSymbol: vscode.DocumentSymbol): OutlineItem[] | undefined {
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