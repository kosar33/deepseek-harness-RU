# @deepseek-ai/dsh-client-ui-settings-key-rotation

[English](README.md) | 中文 | [Русский](README.ru.md)

网页「模型」页每张提供方卡片内的轮换密钥编辑器：当 Host 挂载 [`@deepseek-ai/dsh-llm-key-rotation`](../../llm/llm-key-rotation/README.zh.md) 时，本插件贡献 `settings.models.credential` 槽位，每张卡片用它替代原本的单个 API 密钥输入框——拥有者无需再手改 `cordis.yml` 即可轮换路由密钥。槽位针对所在卡片的路由（owner 属性 `provider`）编辑 `llm-key-rotation` 设置命名空间，并把两路 wire 读取合并为一份共享快照：`llm.keyRotation`（插件实时的逐路由密钥池状态）与 `settings.describe`（该命名空间）。Host 不应答轮换面的部署永远不会看到该槽位——探测失败、不注册，所有卡片保留原生字段。

每行密钥自身携带全部健康信息：状态胶囊位于取值字段与排序按钮之间，把粘滞位置的密钥标为**使用中**，其余为**可用**或**已停用**；已停用者根据快照的 `resetAt` 本地计算倒计时（「限额将在 N 小时 M 分后重置」），随墙钟推进。行即顺序——密钥自上而下依次尝试；箭头调整顺序而不会移动行已绑定的存储引用。提交回路沿用「模型」页的信任模型：输入的值经 `credentials.set` 只写不读，存放在派生的 `<ROUTE>_KEYROTATION_<n>` 引用下（取现有最大索引加一，因此调序绝不会让引用改指另一把机密）；一条整数组 `keys` 操作只记录这些引用名——设置文档永不携带机密。删除全部行会 unset 该路由的用户层条目；被移除的引用会 unset 其凭据。全新的空白行会在任何 wire 调用之前以指名字段的提示阻止提交；两行包含相同值同样阻止——一把机密不应存于两个引用之下。「重置停用时限」胶囊靠齐操作行右侧，经 `llm.keyRotationResetParks` 清除该路由的全部生效停用并重载快照；路由上没有停用时保持禁用。槽位不渲染自己的保存控件：它把整个提交注册进所有者卡片的 `commitSeat` 持有者，卡片按下「应用」时先落盘密钥，并把拒绝（空白行、重复值、wire 失败）当作卡片自己的失败消息展示。不可服务的写入在写入处被拒（插件在 `settings.mutate` 校验），因此「应用」展示 Host 的报错而不是静默停用路由。

推送的失效通知（`settings/document-updated`、`credentials/reference-updated`、`llm/adapters-updated`、重连）免轮询刷新共享快照；打开中的卡片跨刷新保留本地草稿，并在保存时清空已消费的值。

## Model Experience

None：槽位在浏览器设置中配置提供方凭据；这里没有任何内容进入模型请求。

#### KV Cache effect

None；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **这里只编辑密钥** —— 身份字段（端点、协议、模型）留在卡片原生字段与其归属分区中；槽位只写 `llm-key-rotation` 命名空间。
- **开发专用字面量密钥无编辑器** —— 界面只创建引用式密钥；组合仍可声明 `value:` 密钥，它们在状态行显示为 `literal` 标签。
- **状态新鲜度为拉取式** —— 停用变化没有推送事件；标签经共享失效通知与保存后重载刷新，倒计时在两次刷新之间本地推进。
