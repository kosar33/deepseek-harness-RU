# Agent Note: Editing the key-rotation plugin from web Settings

Status: implemented

[English](2026-08-24-llm-key-rotation-settings-editor.md) | 中文

[按路由的密钥池轮换](2026-08-24-llm-key-pool-rotation.zh.md)当初刻意把配置留在了 GUI 之外：要轮换 OpenRouter 密钥的拥有者必须打开 `cordis.yml`、弄懂 profile 加 `keys` 的形状，并靠手工同时写对凭据引用及其顺序。插件自己的快照契约已经预见了渲染 «лимит откатится через Nч Mм» 的设置页组件，但当时没有任何 wire 方法暴露池的健康状态，也没有界面能写入该分区。本笔记补上这个 seam 的另一半：插件安装自己的用户设置分区，Host 通过一个特权 wire 读取提供池健康，一个新的浏览器包按 Models 页确立的同一信任模型编辑路由。

## 问题

三个缺口环环相扣。插件只从组合解析自己的分区，因此每次换钥都是一次需要重启式的编辑。状态 face 只存在于进程内（`ctx.get('llmKeyRotation')`），浏览器无法得知哪些密钥已停用、限额何时重置。即便两者齐备，天真的编辑器要么把密钥值写进 `settings.yaml`——正是 [Web 配置平面](2026-07-30-web-config-plane.zh.md)要防的那类泄漏——要么在 `credentials.set` 之外发明第二条机密通道。

## 决策

### 插件安装自己的设置分区；写入在写入处即被拒绝

插件挂载[插件自有设置界面](2026-08-12-plugin-owned-settings-surface.zh.md)的标准可选分区安装，落在 `llm-key-rotation` 命名空间下，并以 `resolvePools` 作为写入时校验步骤。这使响亮失败规则在新入口保持完整：某个被普通 pi-ai 行占有的路由，即使其分区通过了 schema 校验，也会在 `settings.mutate` 调用处被拒绝——存储文档永远不可能持有解析器无法服务的 providers 字典，与 Loader 在启动时对组合来源分区的拒绝完全一致。已提交的变更会重建池、恢复持久化的停用并无重启地换上注册的路由。

### 一个特权的 unary 读取携带池健康；机密永不随行

`llm.keyRotation` 应答 `{ configured, routes }`：仅当没有组合挂载轮换 face 时 `configured` 为 false（已挂载但休眠的插件应答 true 与空列表）。行把状态 face 的快照逐字段映射为 wire 视图——provider、活跃标签、每键的 label/source/reference/status——再无其他；密钥值没有槽位。该方法加入 `llm.discoverModels` 所在的回环特权平面：它会枚举部署使用的凭据引用名及其实时健康，匿名平面不得提供这些信息。

### 编辑器镜像 Models 页的信任模型，并带轮换自身的形状

浏览器包注册一个 `settings.section` 条目，其 store 联结 `llm.keyRotation`、共享 describe 镜像的命名空间视图与 `credentials.describe`。输入的密钥值经 `credentials.set` 只写不读，存放在派生的 `<ROUTE>_KEYROTATION_<n>` 引用下——取已在用最大索引加一，因此调整行序绝不会让引用改指另一把机密；`settings.mutate` 只记录引用名，脱敏后的设置文档永不收到值。操作针对已存的用户层做最小化：未变字段留在原处、清空的字段执行 unset、调序作为一次整数组 `keys` set、首次保存把新路由作为一个完整 profile 落盘。删除某行会 unset 它的引用；删除整个用户层拥有的路由会 unset 它存储的每条引用。字段校验先于任何 wire 调用：空白的新密钥行或重复的模型 ID 在本地失败，不白花一次往返。基础层拥有的路由隐藏删除入口而非让写入失败——那里的删除意味着恢复组合基础。

状态面板根据快照渲染标签——粘滞位置为使用中、可用、已停用——并在客户端由 `resetAt` 计算倒计时，随墙钟推进；与快照的只读可用性一致，渲染从不改动池状态。姿态跟随组合事实：未挂载显示提示、已挂载为空显示休眠引导；推送的失效通知（settings、credentials、适配器拓扑、重连）让已打开页面免轮询刷新。

## 曾考虑的替代方案

- **经通用的 schema 驱动卡片呈现该分区**（在 [Models 页](2026-08-12-plugin-owned-settings-surface.zh.md)已被否决）——此处因同样理由再加两条被否决：凭据引用联结与重置倒计时都需要手写视图，且 keys 数组的“顺序即语义”无法在通用表单中保留。
- **把轮换路由并入 Models 页的可配置提供方目录** —— 否决：轮换笔记刻意让这些路由脱离目录，因为目录条目宣告的是普通单钥 profile，会让读者误解池。
- **把停用变更作为远程事件推送** —— 暂缓否决：停用目前没有事件通道，而倒计时本来就在客户端推进，拉取加失效通知即可达到同样的可见新鲜度，无需新的事件类型。

## 后果

- 拥有者无需触碰 YAML 即可录入 N 把 OpenRouter 密钥并看到逐钥状态；保存经重建换装路径立即生效。
- 停用变化不推送；在下一次刷新前，面板可能把刚过期的停用仍显示为已停用，直到下一次失效通知、刷新或保存触发的重载。
- 字面量开发用密钥以 `literal` 状态行呈现但没有编辑入口；UI 只创建引用型密钥。
- 特权分类意味着非回环浏览器维持现状：整个配置平面——现在包括这条读取——在真正的认证出现之前不可达。

## 验证

- 插件套件经 Loader 启动真实组合：编辑器的精确回路（先经凭据存储写入密钥值，再 mutate 分区）激活路由并无重启地处理请求；在请求进行途中撤下路由会响亮失败；不可服务的写入带着解析器消息被拒绝；休眠挂载不注册任何东西。
- apiproxy 规格钉住快照映射、缺席 face 的应答（`configured: false`）、handler 路由与 fetch 客户端的 schema 校验；connection 套件钉住 fixture 世界中含停用键的应答与特权平面分类。
- 浏览器包的套件钉住纯函数助手（引用派生、倒计时向上取整、最小 path 操作）、store 联结（含“settings 载荷永不携带机密”断言）、全部姿态下的组件行为（英文与俄文文案）、跟随语言的导航标签、HMR 恢复以及不变量伴生注册；`verify-client-packages` 与 `verify-package-invariants` 通过。

## 相关

- [按路由的 API 密钥池轮换](2026-08-24-llm-key-pool-rotation.zh.md)：拥有本界面所编辑的轮换路由机制：池、停用以及该 wire 读取所投影的快照契约。
- [Web 配置平面](2026-07-30-web-config-plane.zh.md)：拥有本编辑器镜像的信任模型：只写凭据、派生引用以及针对脱敏用户层的最小 path 操作。
- [插件自有的设置界面](2026-08-12-plugin-owned-settings-surface.zh.md)：拥有可选分区的安装及其写入即校验语义。
