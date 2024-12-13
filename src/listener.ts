import * as vscode from 'vscode';
import { isInWorkspace } from './file_info';

export {
    VSCodeEventHandler,
    BaseVSCodeEventHandler,
    VSCodeEvent,
    VSCodeEventHandlerManager
};

interface VSCodeEventHandler {
    OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent): void;
    OnActiveTextEditorChanged(this: any, event: vscode.TextEditor | undefined): void;
    OnTextEditorSelectionChanged(this: any, event: vscode.TextEditorSelectionChangeEvent): void;
    OnWorkspaceFoldersChanged(this: any, event: vscode.WorkspaceFoldersChangeEvent): void;
    OnRenameFiles(this: any, event: vscode.FileRenameEvent): void;
    OnCreateFiles(this: any, event: vscode.FileCreateEvent): void;
    OnDeleteFiles(this: any, event: vscode.FileDeleteEvent): void;
}

class BaseVSCodeEventHandler implements VSCodeEventHandler {
    OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent): void { }
    OnActiveTextEditorChanged(event: vscode.TextEditor | undefined): void { }
    OnTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void { }
    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void { }
    OnRenameFiles(this: any, event: vscode.FileRenameEvent): void { }
    OnCreateFiles(this: any, event: vscode.FileCreateEvent): void { }
    OnDeleteFiles(this: any, event: vscode.FileDeleteEvent): void { }
}

enum VSCodeEvent {
    Default = 0,
    TextDocumentChanged,
    ActiveTextEditorChanged,
    TextEditorSelectionChanged,
    WorkspaceFoldersChanged,
    RenameFiles,
    CreateFiles,
    DeleteFiles
}

class VSCodeEventHandlerManager {
    private handlers: Map<VSCodeEvent, VSCodeEventHandler[]>;

    public RegisterEventHandler(event: VSCodeEvent, handler: VSCodeEventHandler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event)?.push(handler);
    }

    private debouncedTime = 300;

    constructor() {
        this.handlers = new Map<VSCodeEvent, VSCodeEventHandler[]>();
        vscode.workspace.onDidChangeTextDocument(e => this.OnTextDocumentChanged(e));
        vscode.workspace.onDidChangeWorkspaceFolders(e => this.OnWorkspaceFoldersChanged(e));

        vscode.window.onDidChangeTextEditorSelection(e => this.OnTextEditorSelectionChanged(e));
        vscode.window.onDidChangeActiveTextEditor(e => this.OnActiveTextEditorChanged(e));

        vscode.workspace.onDidRenameFiles(e => this.OnRenameFiles(e));
        vscode.workspace.onDidCreateFiles(e => this.OnCreateFiles(e));
        vscode.workspace.onDidDeleteFiles(e => this.OnDeleteFiles(e));
    }

    private debouncedOnTextDocumentChanged = debounce(this._OnTextDocumentChanged, this.debouncedTime);
    private debouncedOnTextEditorSelectionChanged = debounce(this._OnTextEditorSelectionChanged, this.debouncedTime);

    OnRenameFiles(event: vscode.FileRenameEvent) {
        this._OnRenameFiles(event);
    }

    OnCreateFiles(event: vscode.FileCreateEvent) {
        this._OnCreateFiles(event);
    }

    OnDeleteFiles(event: vscode.FileDeleteEvent) {
        this._OnDeleteFiles(event);
    }

    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent) {
        this._OnWorkspaceFoldersChanged(event);
    }


    OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        let uri = event.document.uri;
        if (!isInWorkspace(uri)) {
            return;
        }

        this.debouncedOnTextDocumentChanged(event);
    }

    OnActiveTextEditorChanged(event: vscode.TextEditor | undefined) {
        if (!event) {
            return;
        }

        let uri = event.document.uri;
        if (!isInWorkspace(uri)) {
            return;
        }

        this._OnActiveTextEditorChanged(event);
    }

    OnTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent) {
        let uri = event.textEditor.document.uri;
        if (!isInWorkspace(uri)) {
            return;
        }

        this.debouncedOnTextEditorSelectionChanged(event);
    }

    _OnCreateFiles(event: vscode.FileCreateEvent) {
        this.handlers.get(VSCodeEvent.CreateFiles)?.forEach((listener) => {
            listener.OnCreateFiles(event);
        });
    }

    _OnDeleteFiles(event: vscode.FileDeleteEvent) {
        this.handlers.get(VSCodeEvent.DeleteFiles)?.forEach((listener) => {
            listener.OnDeleteFiles(event);
        });
    }

    _OnRenameFiles(event: vscode.FileRenameEvent) {
        this.handlers.get(VSCodeEvent.WorkspaceFoldersChanged)?.forEach((listener) => {
            listener.OnRenameFiles(event);
        });
    }


    _OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        this.handlers.get(VSCodeEvent.TextDocumentChanged)?.forEach((listener) => {
            listener.OnTextDocumentChanged(event);
        });
    }
    _OnActiveTextEditorChanged(event: vscode.TextEditor | undefined) {
        this.handlers.get(VSCodeEvent.ActiveTextEditorChanged)?.forEach((listener) => {
            listener.OnActiveTextEditorChanged(event);
        });
    }
    _OnTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent) {
        this.handlers.get(VSCodeEvent.TextEditorSelectionChanged)?.forEach((listener) => {
            listener.OnTextEditorSelectionChanged(event);
        });
    }

    _OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent) {
        this.handlers.get(VSCodeEvent.WorkspaceFoldersChanged)?.forEach((listener) => {
            listener.OnWorkspaceFoldersChanged(event);
        });
    }

}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function throttle<T extends (...args: any[]) => void>(func: T, limit: number): (...args: Parameters<T>) => void {
    let lastFunc: NodeJS.Timeout | null;
    let lastRan: number | undefined;
    return function (this: any, ...args: Parameters<T>) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            if (lastFunc) {
                clearTimeout(lastFunc);
            }
            lastFunc = setTimeout(function () {
                if ((Date.now() - lastRan!) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}