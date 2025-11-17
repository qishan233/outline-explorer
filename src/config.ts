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