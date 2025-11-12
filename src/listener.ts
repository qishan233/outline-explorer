import * as vscode from 'vscode';
import { isInWorkspace } from './file';

export {
    VSCodeEvent,
    GlobalVSCodeEventHandlerManager,
};

interface TextDocumentChangedEventHandler {
    OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent): void;
}

interface ActiveTextEditorChangedEventHandler {
    OnActiveTextEditorChanged(event: vscode.TextEditor | undefined): void;
}

interface TextEditorSelectionChangedEventHandler {
    OnTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void;
}

interface WorkspaceFoldersChangedEventHandler {
    OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void;
}


interface RenameFilesEventHandler {
    OnRenameFiles(event: vscode.FileRenameEvent): void;
}

interface CreateFilesEventHandler {
    OnCreateFiles(event: vscode.FileCreateEvent): void;
}

interface DeleteFilesEventHandler {
    OnDeleteFiles(event: vscode.FileDeleteEvent): void;
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
    private TextDocumentChangedEventHandlers: TextDocumentChangedEventHandler[];
    private ActiveTextEditorChangedEventHandlers: ActiveTextEditorChangedEventHandler[];
    private TextEditorSelectionChangedEventHandlers: TextEditorSelectionChangedEventHandler[];
    private WorkspaceFoldersChangedEventHandlers: WorkspaceFoldersChangedEventHandler[];
    private RenameFilesEventHandlers: RenameFilesEventHandler[];
    private CreateFilesEventHandlers: CreateFilesEventHandler[];
    private DeleteFilesEventHandlers: DeleteFilesEventHandler[];


    public RegisterTextDocumentChangedEventHandler(handler: TextDocumentChangedEventHandler) {
        this.TextDocumentChangedEventHandlers.push(handler);
    }

    public RegisterActiveTextEditorChangedEventHandler(handler: ActiveTextEditorChangedEventHandler) {
        this.ActiveTextEditorChangedEventHandlers.push(handler);
    }

    public RegisterTextEditorSelectionChangedEventHandler(handler: TextEditorSelectionChangedEventHandler) {
        this.TextEditorSelectionChangedEventHandlers.push(handler);
    }

    public RegisterWorkspaceFoldersChangedEventHandler(handler: WorkspaceFoldersChangedEventHandler) {
        this.WorkspaceFoldersChangedEventHandlers.push(handler);
    }

    public RegisterRenameFilesEventHandler(handler: RenameFilesEventHandler) {
        this.RenameFilesEventHandlers.push(handler);
    }

    public RegisterCreateFilesEventHandler(handler: CreateFilesEventHandler) {
        this.CreateFilesEventHandlers.push(handler);
    }

    public RegisterDeleteFilesEventHandler(handler: DeleteFilesEventHandler) {
        this.DeleteFilesEventHandlers.push(handler);
    }


    private debouncedTime = 300;

    constructor() {
        this.TextDocumentChangedEventHandlers = [];
        this.ActiveTextEditorChangedEventHandlers = [];
        this.TextEditorSelectionChangedEventHandlers = [];
        this.WorkspaceFoldersChangedEventHandlers = [];
        this.RenameFilesEventHandlers = [];
        this.CreateFilesEventHandlers = [];
        this.DeleteFilesEventHandlers = [];

        // 接收事件
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
        this.CreateFilesEventHandlers.forEach((listener) => {
            listener.OnCreateFiles(event);
        });
    }

    _OnDeleteFiles(event: vscode.FileDeleteEvent) {
        this.DeleteFilesEventHandlers.forEach((listener) => {
            listener.OnDeleteFiles(event);
        });
    }

    _OnRenameFiles(event: vscode.FileRenameEvent) {
        this.RenameFilesEventHandlers.forEach((listener) => {
            listener.OnRenameFiles(event);
        });
    }


    _OnTextDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        this.TextDocumentChangedEventHandlers.forEach((listener) => {
            listener.OnTextDocumentChanged(event);
        });
    }
    _OnActiveTextEditorChanged(event: vscode.TextEditor | undefined) {
        this.ActiveTextEditorChangedEventHandlers.forEach((listener) => {
            listener.OnActiveTextEditorChanged(event);
        });
    }
    _OnTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent) {
        this.TextEditorSelectionChangedEventHandlers.forEach((listener) => {
            listener.OnTextEditorSelectionChanged(event);
        });
    }

    _OnWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent) {
        this.WorkspaceFoldersChangedEventHandlers.forEach((listener) => {
            listener.OnWorkspaceFoldersChanged(event);
        });
    }

}

// 默认 VSCodeEventHandlerManager 对象
const GlobalVSCodeEventHandlerManager = new VSCodeEventHandlerManager();


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