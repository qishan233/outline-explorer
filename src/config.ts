import * as vscode from 'vscode';

export function GetUnsupportedExtensions(): Set<string> {
    // 从配置中读取用户设置的扩展名列表
    const config = vscode.workspace.getConfiguration('outline-explorer');
    const userExtensions = config.get<string[]>('unsupportedFileExtensions', []);

    // 规范化扩展名（确保以 . 开头并转为小写）
    const normalizedExtensions = new Set<string>();
    userExtensions.forEach(ext => {
        const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
        normalizedExtensions.add(normalizedExt);
    });

    return normalizedExtensions;
}


let configChangeEventMap = new Map<string, OutlineExplorerConfigChangeEvent>();

export class OutlineExplorerConfigChangeEvent {
    section: string = '';
}

export class UnsupportedFileExtChangeEvent extends OutlineExplorerConfigChangeEvent {
    section: string = 'outline-explorer.unsupportedFileExtensions';
}


let unsupportedFileExtConfigChangeEventEmitter = new vscode.EventEmitter<UnsupportedFileExtChangeEvent>();
export let UnsupportedFileExtConfigChangedEvent = unsupportedFileExtConfigChangeEventEmitter.event;

/**
 * 监听配置变更，当 unsupportedFileExtensions 改变时提醒用户重新加载插件
 * @param context 扩展上下文
 */
export function Init(context: vscode.ExtensionContext): void {
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        // 检查是否是 unsupportedFileExtensions 配置的变更
        if (event.affectsConfiguration('outline-explorer.unsupportedFileExtensions')) {
            unsupportedFileExtConfigChangeEventEmitter.fire(new UnsupportedFileExtChangeEvent());
        }
    });

    // 将监听器添加到订阅列表，确保在扩展停用时正确清理
    context.subscriptions.push(configWatcher);
}