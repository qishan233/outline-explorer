# outline-explorer

[中文](https://github.com/qishan233/outline-explorer/blob/main/README_ZH.md)

This extension supports displaying outlines in a manner similar to the explorer, inspired by the "Show Member" feature in JetBrains IDEs.

![Feature](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207181650.png)

## Features

### Display Files and Their Outlines

This extension displays files and their outlines in a tree structure:

![Display Files and Their Outlines](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207182357.png)

It also supports multiple folders in the workspace:

![Multiple Folders in Workspace](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/20241207182918.png)

### Interaction with the Editor

Clicking on a file item in the `Outline Explorer` will open that file; Clicking on a symbol will automatically navigate to the location of that symbol:

![Navigate to Symbol](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/navigate-to-symbol.gif)

Switching the active editor will automatically update the selected item in the `Outline Explorer`:

![Switch Active Editor](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/change-active-editor.gif)

Selecting a symbol in the editor will also automatically update the selected item in the `Outline Explorer`:

![Selection Update](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/selection-update-item.gif)

### Monitor Workspace File Changes

When creating, deleting, or renaming files in the workspace directory, the outline tree will automatically update:

![Workspace Event](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/workspace-file-event.gif)

### Refresh Outline

In some scenarios (such as when the outline provider plugin that this extension depends on is not responding properly while loading outline information), outline information may be missing. In this case, you can manually trigger the loading of outline information through the "Refresh" command:

![Refresh](https://raw.githubusercontent.com/qishan233/images/main/vscode-extension/refresh.gif)

## Release Notes

### 0.0.3

Added the ability to refresh directory item in Outline Explorer;

Tree view will not get focus when files are created;

Tree view will be correctly updated when moving files in vscode;

### 0.0.2

Added lazy loading mechanism to avoid issues with fetching outline information when the extension is activated;

Added "Refresh" command to manually update the outline information of file;

Added the ability to update the outline tree when monitoring workspace file changes;

Changed the display of the outline tree when there is only one directory in the workspace;

Improved some details and slightly increased code cleanliness (still far from enough);

### 0.0.1

Added the feature to display files and their outline information, with support for interaction with the editor.

**Enjoy!**
