# `@deepseek-ai/dsh-llm-key-rotation`

函数插件，让一个提供商路由通过对多个 API 密钥的轮换来挺过按密钥的 429 限流。它拥有其配置中列出的路由，从有序密钥池为每个请求提供凭据，并在代理循环的 `agent/request-error` 瀑布上、先于任何重试策略恢复被限流的请求。

`providers` 下的每个条目携带与 dsh-llm-pi-ai 提供商 profile 相同的字段，唯独 `apiKeyEnv` 被有序的 `keys` 列表取代。每个键恰好指名一个来源：经凭据 seam 按请求解析的凭据引用（`apiKeyEnv`），或逐字落入组合文件、仅用于开发的字面量 `value`。可选的 `label` 在日志中命名该键；缺省为引用名或从一开始计的位置。在此注册的路由不得同时声明于普通 dsh-llm-pi-ai 节，因为两次注册不能拥有同一路由。解析在插件加载时校验每个路由：缺失或成对的键来源、重复标签、畸形引用、空白字面量与不可服务的协议都会使挂载响亮失败。

请求以每进程一个粘滞位置认证。在多键路由出现 `RATE_LIMIT` 失败时，监听器把被服务的密钥停用到其重置时刻——适配器暴露时用失败的 `providerRetryAfterMs`，否则取界定每日配额的即将到来的 UTC 午夜——推进到第一个未停用的键并返回 `{ kind: 'retry' }`，于是循环立即在下一个键下重发完全相同的请求，无需排定的等待。每次切换都经标准日志器记录两个键与重置时刻；不向会话日志追加任何内容。当每个成员都被停用时，抛出的错误携带代码 `KEY_POOL_EXHAUSTED` 并列出每个键及其重置时间戳。停用在读取时惰性过期，因此没有定时器运行，被停用的密钥恰在其重置时刻重返服务。

停用跨越重启存活。每条停用持久化于 harness 主目录下 `.credentials.yaml` 旁边的 `.llm-key-rotation-parks.json`——用 `parkFile` 覆盖位置，用 `dshHome` 覆盖其缺省依据的主目录。文档只含标签与时间戳，绝无密钥值；在每次停用或过期变更时以仅属主模式原子重写。挂载时，过期行丢弃，命名配置不再拥有的路由或键的行被剪除，活跃停用按路由与标签重新挂接，粘滞成员被停用的池从第一个可用密钥启动。缺席的文档即空状态；损坏或版本不符的文档会指名路径使挂载响亮失败。写入失败的保存会响亮记日志，轮换在该次运行中以内存状态继续。

监听器以 `prepend` 注册，因此无论挂载顺序如何，轮换都先于普通恢复策略：被停用的键在 dsh-llm-retry 得以安排同键退避等待之前就被绕过，而重试的尝试若再次失败则以全新状态到达 dsh-llm-retry。单键池对所有失败原样委派，因此其行为与普通适配器完全一致，包括重试策略与退避。非 `RATE_LIMIT` 的失败，以及本插件不拥有的路由的失败，原样委派。

```yaml
- id: credentials
  name: '@deepseek-ai/dsh-credentials-local'

- id: llm-openrouter
  name: '@deepseek-ai/dsh-llm-key-rotation'
  config:
    providers:
      openrouter:
        displayName: OpenRouter
        api: openai-completions
        baseURL: https://openrouter.ai/api/v1
        models:
          - id: anthropic/claude-sonnet-4.5
            name: Claude Sonnet 4.5
            contextWindow: 200000
        keys:
          - apiKeyEnv: OPENROUTER_KEY_1
          - apiKeyEnv: OPENROUTER_KEY_2
          - apiKeyEnv: OPENROUTER_KEY_3
            label: spare
```

把被引用的值存入 `$DSH_HOME/.credentials.yaml` 的 `refs:` 下（Web 的 Models 页写入该文档），或在启动环境中导出；没有凭据 seam 的组合只回退到环境。解析为空的引用会使请求以 `MISSING_CREDENTIAL` 失败并命名池键，而不是静默跳过成员。

## 状态表面

只要至少配置了一个路由，插件就提供一个其他插件经 `ctx.get('llmKeyRotation')` 读取的状态 face。其唯一方法 `snapshot()` 渲染每个已配置路由；快照中的可用性是只读视图，读取它从不改动池状态或持久化文件。密钥值绝不出现。

```json
[
  {
    "provider": "openrouter",
    "activeLabel": "OPENROUTER_KEY_2",
    "keys": [
      {
        "provider": "openrouter",
        "label": "OPENROUTER_KEY_1",
        "source": "reference",
        "reference": "OPENROUTER_KEY_1",
        "status": {
          "state": "parked",
          "parkedAt": "2026-08-24T12:00:00.000Z",
          "resetAt": "2026-08-25T00:00:00.000Z"
        }
      },
      {
        "provider": "openrouter",
        "label": "OPENROUTER_KEY_2",
        "source": "reference",
        "reference": "OPENROUTER_KEY_2",
        "status": { "state": "usable" }
      }
    ]
  }
]
```

`keys` 下的每个条目携带 `provider`、`label`、`source` —— `reference` 及其引用名，或不带任何 reference 字段的仅开发用 `literal` —— 以及 `status`：`{ state: 'usable' }`，或带 ISO 8601 UTC 时刻的 `{ state: 'parked', parkedAt, resetAt }`。设置页组件通过将 `status.resetAt` 与当前时间求差来渲染«лимит откатится через Nч Mм»（距限额回滚还剩 N 小时 M 分）——无需插件内部。`activeLabel` 命名下一请求认证所用的位置；当所有键都被停用时，它命名请求将失败的卡住位置。插件休眠（无已配置提供商）时该 face 不存在。

## Model Experience

### 模型请求的恢复

#### 模型看到什么

任何轮换、停用、重置时间戳或密钥身份都对模型不可见。重试的请求携带相同的消息历史、工具与调用配置；改变的只有 `Authorization` 头的值。

#### Token 效应

每次切换键都会重复一次对提供商的请求及其输入 token 计费，此时尚无任何输出；切换本身就是恢复动作 `{ kind: 'retry' }`，不向会话日志追加内容。停用让已耗尽的密钥在其重置前停止计费，而不是把重试花费在它们身上。

#### KV Cache 效应

重试的请求保留既有前缀，并按各提供商的规则有资格复用其缓存。在按账户计量缓存的提供商处，不同密钥通常持有相互独立的缓存。

## 已知限制与推迟的工作

- **重置精度取决于适配器** —— 经 pi-ai 路径时，线上错误被压平为消息文本，因此每日限额的停用持续到即将到来的 UTC 午夜；当适配器暴露 `providerRetryAfterMs` 时会被采纳。
- **停用跟踪的是粘滞位置而非请求** —— 并发请求共享一个进程级粘滞索引，因此一次失败可能停用另一在飞请求正被服务的位置；单代理会话不受影响。
- **路由所有权转移给本插件** —— 被轮换的路由不能同时出现在普通 dsh-llm-pi-ai 节中，且不会为其提供可配置提供商目录条目。
- **持久化在文档级别为单写者** —— 停用文档没有跨进程写锁，共享同一 `parkFile` 的两个 harness 进程会互相覆盖停用；需要时给每个部署各自的位置。
