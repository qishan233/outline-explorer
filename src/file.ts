import * as vscode from 'vscode';
import * as path from 'path';
import * as Logger from './log';
import { GetUnsupportedExtensions } from './config';


export class FileInfo {
    uri: vscode.Uri;
    type: vscode.FileType;

    constructor(uri: vscode.Uri, type: vscode.FileType) {
        this.uri = uri;
        this.type = type;
    }
}


export async function isFile(uri: vscode.Uri): Promise<boolean | Error> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.type === vscode.FileType.File;
    } catch (error: any) {
        Logger.Error('Error checking file type:', error, uri);
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

export function getParentUriInWorkspace(uri: vscode.Uri): vscode.Uri | undefined {
    if (!isInWorkspace(uri)) {
        return undefined;
    }

    const parent = vscode.Uri.file(path.dirname(uri.fsPath));

    if (isInWorkspace(parent)) {
        return parent;
    }

    return undefined;
}

export async function getFileInfosInPath(uri: vscode.Uri): Promise<FileInfo[] | undefined> {
    if (!isInWorkspace(uri)) {
        return undefined;
    }

    try {
        let uriIsFile = await isFile(uri);
        const p = new FileInfo(uri, uriIsFile ? vscode.FileType.File : vscode.FileType.Directory);

        let parentUri = getParentUriInWorkspace(uri);
        if (!parentUri) {
            return [p];
        }

        let parents = await getFileInfosInPath(parentUri);

        if (!parents) {
            return [p];
        }

        return [...parents, p];
    } catch (error) {
        Logger.Error('getFileEntriesInPath error:', error);
        return undefined;
    }
}

export async function getFileInfosInDir(uri: vscode.Uri, ignores: vscode.Uri[] | undefined): Promise<FileInfo[]> {
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
            return new FileInfo(vscode.Uri.joinPath(uri, name), type);
        });

        return fileEntries;
    } catch (error) {
        Logger.Error('getFileEntriesInDir error:', error);
    }


    return [];
}


export function IsSupportedFile(uri: vscode.Uri): boolean {
    const unsupportedExtensions = GetUnsupportedExtensions();

    let ext = path.extname(uri.fsPath).toLowerCase();
    if (ext === '') {
        ext = path.basename(uri.fsPath).toLowerCase();
    }

    return !unsupportedExtensions.has(ext);
}