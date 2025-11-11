import * as vscode from 'vscode';

export async function GetDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
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

    results = sortDocumentSymbols(results);

    return results;
}

function sortDocumentSymbols(documentSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    documentSymbols.sort((a, b) => {
        let asl = a.selectionRange.start.line;
        let bsl = b.selectionRange.start.line;

        if (asl < bsl) {
            return -1;
        } else if (asl > bsl) {
            return 1;
        } else {
            let asc = a.selectionRange.start.character;
            let bsc = b.selectionRange.start.character;

            if (asc < bsc) {
                return -1;
            } else if (asc > bsc) {
                return 1;
            }

            return 0;
        }
    });
    for (let documentSymbol of documentSymbols) {
        if (documentSymbol.children) {
            documentSymbol.children = sortDocumentSymbols(documentSymbol.children);
        }
    }

    return documentSymbols;
}

export const SymbolKind2IconId = new Map<vscode.SymbolKind, string>([
    [vscode.SymbolKind.File, 'symbol-file'],
    [vscode.SymbolKind.Module, 'symbol-module'],
    [vscode.SymbolKind.Namespace, 'symbol-namespace'],
    [vscode.SymbolKind.Package, 'symbol-package'],
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


export class OutlineInfo {
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

export function getParentsOfDocumentSymbol(items: OutlineInfo[], targetDocumentSymbol: vscode.DocumentSymbol): OutlineInfo[] | undefined {
    for (let item of items) {
        if (isDocumentSymbolEqual(item.documentSymbol, targetDocumentSymbol)) {
            return [];
        }

        if (item.documentSymbol.children) {
            let parents = getParentsOfDocumentSymbol(item.documentSymbol.children.map(child => ({ documentSymbol: child })), targetDocumentSymbol);
            if (parents) {
                return [item, ...parents];
            }
        }
    }

    return undefined;
}