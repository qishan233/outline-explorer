# 重构 item_loader 实现

## 现状

ItemLoaderFacade 目前共 10 个方法，统计如下：

| 方法名 | 功能 | 参数类型 | 重构建议 |
|:--:|:--:|:--:| :--: |
| LoadItemsInDir | 加载目录下所有的 FileItem | Item | 保留 |
| LoadOutlineItems | 加载 FileItem 对应的所有 OutlineItem | Item | 保留 |
| LoadItemsInPath | 加载 Root 到 Uri 所有的文件 FileItem | Uri | 保留 |
| LoadOutlineItemsOfUri | 加载 Uri 表示的 FileItem 对应的所有 OutlineItem | Uri | 合并到 LoadOutlineItems |
| LoadFileItem | 加载 Uri 对应的 FileItem | Uri | 保留 |
| LoadParentItem | 加载 element 对应的 parent Item | Item | 合并到 LoadItemsInPath |
| DeleteItem | 移除 Item | Item | 保留 |
| GetFileItem | 获取 Uri 对应的 FileItem | Uri | 保留 |
| SetFileItem | 设置 Uri 对应的 FileItem | Uri/FileItem| 保留 |
| GetOutlineItems | 获取 Uri 对应的 OutlineItems | Uri | 保留 |

## 问题

当前 ItemLoaderFacade 实现没有章法，相当于大杂烩；

1. 一些方法看不懂使用场景：没有设计，只是实现了功能；
2. 参数不够统一：既有 vscode.Uri，也有 Item；参数混乱可能说明定位也是不清晰的；
3. 门面模式并没有屏蔽细节，或者说让系统变得更简单，反而略显臃肿，耦合很多场景；要描述功能，而不是场景；
4. Loader 和 Getter、Setter 混为一谈：名称为 Loader，实际上也承担了 Getter 和 Setter 的作用；

因此，希望对 ItemLoaderFacade 甚至 ItemLoader 进行重新设计和规划；

## 功能

1. 加载对应目录下所有的 FileItem；
2. 加载对应文件下所有的 OutlineItem；
3. 递归加载 Item 对应的 Parent；
4. 加载 Uri 对应的 FileItem；
5. 移除 FileItem；
6. 获取 Uri 对应的 FileItem；
7. 设置 Uri 对应的 FileItem；

## 方案

1. 重命名 Loader 为 Manager
   1. 体现 Loader、Getter、Setter 的作用；
2. 合并冗余的 Facade 方法
   1. 描述功能，而非场景；
