# Change Log

All notable changes to the "outline-explorer" extension will be documented in this file.

## [0.1.0] - 2025-11-16

### Added

1. Expand all workspace folders;
2. Collapse all expanded items;
3. Expand current item and it's children. For performance considerations, only expand two times when there are folders or files;
4. Collapse all the expanded child items of the current item;

## [0.0.6] - 2025-01-29

### Added

1. Added the feature that revealing active editor item in tree view when the view is visible;

### Fixed

1. Fixed the problem that outline info wasn't updated when the tree view is not visible;

## [0.0.5] - 2025-01-09

### Fixed

1. Fixed the problem that tree view item isn't selected when the symbol is selected

## [0.0.4] - 2024-12-30

### Added

1. Sort outlines by their positions in the document;

## [0.0.3] - 2024-12-24

### Added

1. Added the ability to refresh directory item in Outline Explorer;

### Changed

1. Tree view will not get focus when files are created;

### Fixed

1. Tree view will be correctly updated when moving files in vscode;

## [0.0.2] - 2024-12-14

Added lazy loading mechanism to avoid issues with fetching outline information when the extension is activated;

Added "Refresh" command to manually update the outline information of file;

Added the ability to update the outline tree when monitoring workspace file changes;

Changed the display of the outline tree when there is only one directory in the workspace;

Improved some details and slightly increased code cleanliness (still far from enough);

## [0.0.1] - 2024-12-07

- Added the feature to display files and their outline information, with support for interaction with the editor.
