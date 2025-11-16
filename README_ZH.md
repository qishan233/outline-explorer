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

### 监听工作区文件变化

在工作区目录中新建、删除、重命名文件时，大纲树会自动更新：

![workspace-event](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/workspace-file-event.gif)

### 刷新大纲

在某些场景下（如加载大纲信息时，本插件所依赖的大纲提供者插件尚无法正常响应请求）会出现大纲信息缺失的情况，此时可通过“刷新”命令手动触发大纲信息的加载：

![refresh](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/refresh.gif)

## 发布说明

### 0.1.0

添加了 [issue2](https://github.com/qishan233/outline-explorer/issues/2) 中所需的功能：

- 展开所有工作区文件夹；
- 折叠所有已展开的项；
- 展开当前项及其子项。出于性能考虑，当存在文件夹或文件时，仅展开两层；
- 折叠当前项的所有已展开子项；

### 0.0.6

添加了在视图可见时在树视图中显示活动编辑器项的功能；

修复了当树视图不可见时大纲信息未更新的问题；

### 0.0.5

修复了符号被选中时大纲树元素未被选中的问题；

### 0.0.4

增加了对大纲项按照其在文档中的位置进行排序的特性；

### 0.0.3

新增对目录项的刷新；

创建文件后，视图将不再获得焦点；

在 vscode 中移动文件后，视图将正确地被更新；

### 0.0.2

添加延迟初始化机制以避免插件激活时无法获取大纲信息的问题；

添加“刷新”命令以手动更新文件的大纲信息；

添加监控工作区文件变更时更新大纲树的能力；

改变了在工作区仅有一个目录时大纲树的展示方式；

完善了一些细节，稍微提高了一下代码整洁度（还远远不够）；

### 0.0.1

添加了展示文件及其大纲信息的功能，支持与编辑器进行联动；

**尽情享受吧！**
