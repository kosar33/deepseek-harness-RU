# Agent Note: 密钥轮换附着到既有提供方路由

Status: implemented

[English](2026-08-24-llm-key-rotation-provider-key-overlay.md) | 中文

[从网页设置编辑密钥轮换插件](2026-08-24-llm-key-rotation-settings-editor.zh.md) 交付的轮换是「路由所有者」式的：插件为自有路由构建 pi-ai 档案、在 `ctx.llm` 注册、拒绝与普通行的冲突，并在浏览器里给出一个端到端管理这些路由的独立设置页。拥有者审阅该界面后否决了它——这是在重新发明「模型」页已有的能力：提供方的创建、命名与身份编辑都在那里，第二个路由管理面只是重复。本笔记记录替代设计：轮换只保留密钥，按 id 附着到路由，其编辑器住进每张既有的提供方卡片。

## Problem

拥有者指定的交互只有一条规则：在提供方编辑卡内、原本单个 API 密钥输入框的位置上，挂载了轮换插件就显示有序的多密钥列表——含停用倒计时、当前密钥高亮；未挂载则显示和原来完全一样的字段。卡片其余一切（添加流程、目录词表、身份字段、删除）必须原样不动。由此两条约束：其一，被轮换的路由必须保持恰好一次适配器注册，接管或重复所有权都不允许；其二，当 Host 组合缺少该插件时浏览器必须干净降级——卡片不能因为客户端包带了槽位就丢掉原生密钥字段。

## Decision

### 可选的覆盖服务取代路由所有权

`dsh-llm` 定义 `LlmApiKeyOverride` —— 单方法 `resolve(provider): Promise<string | undefined>`，消费方经 `ctx.get('llmApiKeyOverride')` 读取。轮换插件改为提供它而不再注册适配器：池对自家路由先行应答，`undefined` 回落到该族的原生解析；解析为空的引用仍以 `MISSING_CREDENTIAL` 大声失败，而不是悄悄退回原生单密钥。dsh-llm-pi-ai 与 dsh-llm-deepseek 在各自 `resolveApiKey` 的最顶端询问它，这也覆盖了端点探测，因为发现复用同一解析器。注册天然保持单一所有者；重复拒绝契约无需反转。代价已被接受并写入文档：手改的组合可以写出没有任何族服务的路由，留下一个惰性池。

### 存储只剩密钥；身份留在原地

`llm-key-rotation` 设置命名空间收缩为 `{ providers: { [route]: { keys } } }` —— 写入校验仍跑 `resolvePools`，只是不再解析档案。组合条目在路由自身的 pi-ai/deepseek 声明旁边列出同样的形状。停用持久化、粘滞位置恢复、`KEY_POOL_EXHAUSTED`、`llm.keyRotation` 快照全部不变——它们从来不依赖谁注册了适配器。

### 槽位经 slot 系统 + 探测门控

`ui-settings-models` 声明 `settings.models.credential` 孔（`single`，owner 属性 `provider`），恰好在密钥输入框的 DOM 位置分发，并把该输入框作为分发 fallback。`ui-settings-key-rotation` 经 `slots.inject` 贡献编辑器，但只在一次探测调用 `api.llm.keyRotation({})` 成功之后：Host 面缺席即不注册，所有卡片渲染各自的 fallback 字段。每张卡片的行草稿是按 provider 键控的组件本地状态；共享存储只保留服务端事实。绑定了槽位时，父卡片的 `credentialRequired` 门控被抑制——提交权属于槽位，否则父 Apply 会对着永不渲染的输入框死锁。

## Alternatives considered

- **保留独立设置页并与槽位并存** —— 两个界面会用不一致的词表管理同一提供方的密钥；拥有者审阅时直接否决了独立页面，认为它重复了「模型」卡片。
- **轮换接管其路由的适配器注册** —— 原设计：被否决，因为一条路由必须保持恰好一个注册所有者，接管要么造成重复注册，要么强迫每个消费分区移交路由。
- **逐请求轮转而非粘滞加停用** —— 对已知要等到重置时刻才可用的密钥仍发请求会浪费配额；停用文档本就编码了这些时刻，因此无需探测即可跳过它们。

## Consequences

- 单一心智模型：提供方只在「模型」页已支持的地方创建一次，轮换它绝不移动它的身份。
- 开关插件只改变卡片上密钥编辑落在哪里——没有重启式迁移，也没有孤儿提供方。
- 上一笔记的独立分区界面、添加路由流程、删除路由入口与未挂载提示不复存在；其信任模型与持久化决策在此原样延续。

## Verification

- Host 套件覆盖 `resolvePools` 校验、覆盖顺序/停用/过期、响亮的 `MISSING_CREDENTIAL`、在途交换守卫、停用恢复与剪除，以及真实组合启动（pi-ai 服务路由、本插件覆盖密钥）；逐文件覆盖率保持 100%。
- 客户端套件覆盖探测门控注册（有与无）、语言字典、HMR/dispose 移除、标签渲染（当前高亮与倒计时）、跨 provider 切换的行草稿生命周期、整数组 keys 操作加凭据 set/unset 回路、空白行拒绝；逐文件覆盖率保持 100%。
- 合并前对组装后的应用运行 `pnpm run typecheck`、范围 lint、`verify-client-packages`、`verify-package-invariants`、`test:gui` 与重放式 web e2e。
