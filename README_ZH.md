# outline-explorer

[English](https://github.com/qishan233/outline-explorer/blob/main/README.md)

该扩展支持以类似资源管理器的方式显示大纲，灵感来自 JetBrains IDE 中的“Show Member”功能。

![功能](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207181650.png)

## 功能

### 显示文件及其大纲

该扩展以树状结构显示文件及其大纲：

![显示文件及其大纲](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207182357.png)

它还支持工作区中的多个文件夹：

![工作区中的多个文件夹](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207182918.png)

### 与编辑器联动

点击 `Outline Explorer` 中的文件项，将打开该文件；点击符号将自动定位到该符号的位置：

![导航到符号](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/navigate-to-symbol.gif)

切换活动编辑器将自动更新`Outline Explorer`中的选中项：

![切换活动编辑器](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/change-active-editor.gif)

选中编辑器中的符号也将自动更新`Outline Explorer`中的选中项：

![选中更新](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/selection-update-item.gif)

## 发布说明

### 0.0.1

添加了展示文件及其大纲信息的功能，支持与编辑器进行联动；

**尽情享受吧！**
