# Agent Note: Localizing web command and card copy through dictionaries

Status: implemented

[English](2026-08-26-web-command-and-card-copy-localization.md) | 中文

三个 Web 界面此前在渲染处硬编码英文文案：工具卡片（diff/read/search/web 区块）、进行中回合的状态标签，以及直接沿用宿主命令目录英文描述的斜杠菜单行。现在三者都通过客户端 locale 运行时解析文案，部署选择的语言即可覆盖整个输入区表面，而无需改动宿主侧字符串。本笔记把[客户端 locale 全面铺开](../architecture/2026-07-30-client-locale-full-rollout.zh.md)的准则——原子组件以 props 接收文案、插件从自己的 `t` 席位解析——延伸到它之后出现的三处表面；该记录没有任何内容被推翻。

## 决策

### 工具卡片通过 props 获取标签

`DiffBlock`、`ReadBlock`、`SearchBlock`、`WebBlock` 接收由 `ui-tool` 依据共享字典构建的 labels prop；区块组件保持纯展示，自身不绑定 locale。键名构造集中在 `block-labels.ts` 一个模块里——新增卡片意味着新增一条字典项，而不是修改组件。

### 进行中回合的状态标签走会话字典

流式回答上方的状态行与其余 Chat 行一致，通过会话命名空间解析，不再使用私有字面量。

### 斜杠菜单描述按命令名本地化；未知命令保留宿主文案

新的 `command.description` locale 命名空间以 `cmd.<name>` 为已知宿主命令（`compact`、`goal`、`permission`、`feedback`、`export`、`plan`）提供行文案。候选合成时向翻译器查询 `cmd.<name>`，当翻译结果原样返回请求的键（字典未命中的信号）时，回退到宿主目录描述。因此后加的宿主命令至多暂时显示英文，绝不会渲染成损坏的行。
