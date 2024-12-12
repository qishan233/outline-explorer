import * as vscode from 'vscode';

let outlineExplorerOutputChannel = vscode.window.createOutputChannel('Outline Explorer');

function getFormattedDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以需要加1
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatMessage(level: string, ...args: any[]): string {
    const formattedDate = getFormattedDate();
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    return `[${formattedDate}] ${level}: ${message}`;
}

export function Info(...args: any[]) {
    const formattedMessage = formatMessage('INFO', ...args);
    outlineExplorerOutputChannel.appendLine(formattedMessage);
}

export function Warn(...args: any[]) {
    const formattedMessage = formatMessage('WARN', ...args);
    outlineExplorerOutputChannel.appendLine(formattedMessage);
}

export function Error(...args: any[]) {
    const formattedMessage = formatMessage('ERROR', ...args);
    outlineExplorerOutputChannel.appendLine(formattedMessage);
}