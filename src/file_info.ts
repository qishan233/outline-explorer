import * as vscode from 'vscode';
import * as path from 'path';

async function isFile(uri: vscode.Uri): Promise<boolean | Error> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.type === vscode.FileType.File;
    } catch (error: any) {
        console.log('isFile 出错了：uri:', uri);
        console.error('Error checking file type:', error, uri);
        return error;
    }
}


export function isInWorkspace(uri: vscode.Uri): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return false;
    }

    return workspaceFolders.some(folder => uri.toString().startsWith(folder.uri.toString()));
}

export function getWorkspaceParentUri(uri: vscode.Uri): vscode.Uri | undefined {
    if (!isInWorkspace(uri)) {
        return undefined;
    }

    const parent = vscode.Uri.file(path.dirname(uri.fsPath));

    if (isInWorkspace(parent)) {
        return parent;
    }

    return undefined;
}

export async function getFileEntriesInPath(uri: vscode.Uri): Promise<FileEntry[] | undefined> {
    if (!isInWorkspace(uri)) {
        return undefined;
    }

    try {
        let uriIsFile = await isFile(uri);
        const p = { uri: uri, type: uriIsFile ? vscode.FileType.File : vscode.FileType.Directory };

        let parentUri = getWorkspaceParentUri(uri);
        if (!parentUri) {
            return [p];
        }

        let parents = await getFileEntriesInPath(parentUri);

        if (!parents) {
            return [p];
        }

        return [...parents, p];
    } catch (error) {
        console.error('getFileEntries error:', error);
        return undefined;
    }
}

export async function getFileEntriesInDir(uri: vscode.Uri, ignores: vscode.Uri[] | undefined): Promise<FileEntry[]> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.Directory) {
            return [];
        }
        let children = await vscode.workspace.fs.readDirectory(uri);
        if (ignores) {
            children = children.filter(([name, type]) => {
                if (ignores.some(ignore => name.startsWith(path.basename(ignore.fsPath)))) {
                    return false;
                }

                return true;
            });
        }

        children.sort((a, b) => {
            if (a[1] === b[1]) {
                return a[0].localeCompare(b[0]);
            }
            return a[1] === vscode.FileType.Directory ? -1 : 1;
        });

        const fileEntries = children.map(([name, type]) => {
            return { uri: vscode.Uri.file(path.join(uri.fsPath, name)), type };
        });

        return fileEntries;
    } catch (error) {
        console.error('getFileEntriesInDir error:', error);
    }


    return [];
}

export interface FileEntry {
    uri: vscode.Uri;
    type: vscode.FileType;
}
