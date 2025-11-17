import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

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

/**
 * 监听配置变更，当 unsupportedFileExtensions 改变时提醒用户重新加载插件
 * @param context 扩展上下文
 */
export function watchConfigurationChanges(context: vscode.ExtensionContext): void {
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        // 检查是否是 unsupportedFileExtensions 配置的变更
        if (event.affectsConfiguration('outline-explorer.unsupportedFileExtensions')) {
            // 弹窗提醒用户重新加载窗口
            const message = localize('config.changed.message', 'File extension configuration has changed. The window needs to be reloaded for the changes to take effect.');
            const reloadButton = localize('config.changed.reload', 'Reload Now');
            const laterButton = localize('config.changed.later', 'Later');

            vscode.window.showInformationMessage(
                message,
                reloadButton,
                laterButton
            ).then(selection => {
                if (selection === reloadButton) {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });

    // 将监听器添加到订阅列表，确保在扩展停用时正确清理
    context.subscriptions.push(configWatcher);
}