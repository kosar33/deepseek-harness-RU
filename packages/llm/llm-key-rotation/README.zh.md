# `@deepseek-ai/dsh-llm-key-rotation`

[English](README.md) | 中文 | [Русский](README.ru.md)

函数插件：让已有的提供方路由在逐密钥 429 限流下继续可用——在多把 API 密钥间轮换。它附着到普通适配器族（dsh-llm-pi-ai 与 dsh-llm-deepseek）已注册的路由，只用有序密钥池覆盖这些路由的凭据解析，并在代理循环的 `agent/request-error` 瀑布上、先于任何重试策略恢复被限流的请求。其余全部档案字段仍由路由所属的分区持有。

`providers` 下每个条目以既有路由 id 为键，只携带有序的 `keys` 列表。每把密钥只命名一个来源：凭据引用（`apiKeyEnv`，每次请求经凭据缝解析），或字面量 `value`（原样落入组合文件，仅供开发）。可选 `label` 在日志中命名该密钥，缺省为引用名或一-based 位置。插件加载时校验每个条目：密钥来源缺失或重复、标签重复、引用格式错误、空白字面量都会让挂载失败；路由条目上出现 `apiKeyEnv` 会被拒绝——该字段属于路由自己的档案。没有被任何适配器族服务的路由只会留下一个惰性池：无害，且只有手改组合才可能出现，因为网页编辑器只把密钥写到活的提供方卡片上。

覆盖通过本插件提供的可选服务 `llmApiKeyOverride` 传递；适配器族在原生凭据解析之前询问它，收到 `undefined` 即回落。适配器注册因此完全不动——注册的族仍是路由的唯一所有者，轮换一个提供方不会造成重复注册。池中某把密钥的引用解析为空时，请求以 `MISSING_CREDENTIAL` 失败并点名该池密钥，而不是悄悄回落到原生单密钥：配置错误的池不允许无声地停止轮换。

每个进程一个粘滞位置。多密钥路由遇到 `RATE_LIMIT` 失败时，监听器把正在使用的密钥停用到其重置时刻——适配器给出 `providerRetryAfterMs` 时用它，否则用约束每日额度的下一个 UTC 午夜——前进到第一把未停用的密钥并返回 `{ kind: 'retry' }`，循环立即用下一把密钥原样重发请求，不进入计划等待。每次切换都通过标准日志记录两把密钥与重置时刻；会话日志不追加任何内容。全部成员都停用时，抛出的错误带码 `KEY_POOL_EXHAUSTED` 并列出每把密钥与重置时间——每项附有导致停用的上游文本的截短摘录。停用按读取惰性过期：没有任何定时器，被停用的密钥恰好在重置时刻回到服务。

两类失败轮换而不停用。压平正文指名网关共享上游池（`limit_source: upstream_provider_shared_pool`）的限流保持旋转不动、交给同键常规退避：被服务的密钥并无过错。读作网关转发其上游供应商错误（「Provider returned error」）的失败立即前进到下一把密钥并在那里原样重发——不停用、不等待：多密钥池把备用尝试花在一次供应商抖动上而不是直接失败；循环的重试预算约束总尝试次数。

停用状态跨重启保留。每次停用持久化到 harness home 下 `.credentials.yaml` 旁的 `.llm-key-rotation-parks.json`——用 `parkFile` 覆盖位置，或用 `dshHome` 覆盖其缺省依据的 home。文档只含标签与时间戳，绝无密钥值；每次停用或过期变化都以 owner-only 模式原子重写。挂载时：过期行丢弃、指向已不存在路由或密钥的行剪除、存活停用按路由与标签重新附着、粘滞成员被停用的池从第一把可用密钥开始。文档缺失即空状态；损坏或版本不符的文档让挂载大声失败并指明路径。持久化写入失败只大声记日志，本轮旋转在内存状态上继续。

监听器以 `prepend` 注册，因此无论挂载顺序如何，旋转都先于普通恢复策略：被停用的密钥先被越过，dsh-llm-retry 才不会为同一失败安排同密钥退避等待；重试后的尝试若再次失败，也会新鲜地进入 dsh-llm-retry。单密钥池对一切失败原样放行，行为与原生解析完全一致，包括重试策略与退避。非 `RATE_LIMIT` 的失败、以及没有池的路由的失败，都原样委托。展平后正文指明限流方是提供商共享上游池（`upstream_provider_shared_pool`，OpenRouter 以此报告与调用方密钥无关的节流）的 `RATE_LIMIT` 同样原样委托：此时停用会让所有健康密钥闲置到兜底期限，而所服务密钥自身的配额并未耗尽——真正的对策是短暂等待，即在原密钥上进行常规退避。

```yaml
# The route itself lives in its home section, as any provider does:
- id: llm-openrouter
  name: '@deepseek-ai/dsh-llm-pi-ai'
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

# This plugin adds only the rotating keys for that same route id:
- id: llm-openrouter-keys
  name: '@deepseek-ai/dsh-llm-key-rotation'
  config:
    providers:
      openrouter:
        keys:
          - apiKeyEnv: OPENROUTER_KEY_1
          - apiKeyEnv: OPENROUTER_KEY_2
          - apiKeyEnv: OPENROUTER_KEY_3
            label: spare
```

被引用的值存入 `$DSH_HOME/.credentials.yaml` 的 `refs:`（网页「模型」页写入该文档），或在启动环境中导出；没有凭据缝的组合只回退到环境变量。

## 状态面

插件一经组合即提供状态面，其他插件经 `ctx.get('llmKeyRotation')` 读取。方法 `snapshot()` 渲染每个已配置路由；快照中的可用性是只读视图，读取绝不改动池状态或持久化文件。密钥值永不出现。`resetParks(route)` 一次清除单个路由的全部生效停用——同时作用于内存与持久化文件：这是误停用（例如上游共享池限流所致）的应急出口，返回是否有实际清除。

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

`keys` 下每个条目携带 `provider`、`label`、`source` —— `reference` 附带 `reference` 名，或开发专用字面量的 `literal`（完全没有 reference 字段）—— 以及 `status`：`{ state: 'usable' }`，或 `{ state: 'parked', parkedAt, resetAt }`（ISO 8601 UTC 时刻）。设置页部件将 `status.resetAt` 与当前时间相减即可渲染「限额将在 N 小时 M 分后重置」——不需要任何插件内部。`activeLabel` 命名下一次请求认证所用位置；全部密钥停用时，它命名的是请求将失败的那个卡住位置。休眠（未配置任何路由）时该面缺席。

## Model Experience

### Model-request recovery

#### What the model sees

模型看不到任何轮换、停用、重置时刻或密钥身份。重试请求携带完全相同的消息历史、工具与调用配置；只有 `Authorization` 头的值变化。

#### Token effect

每次密钥切换会在任何输出存在之前重复一次提供方请求并计入输入 token 计费；切换本身就是恢复动作 `{ kind: 'retry' }`，不向会话日志追加内容。停用让耗尽的密钥在重置前不再花费重试。

#### KV Cache effect

重试请求保留先前前缀，可按各提供方规则享受缓存复用。在按账户计量缓存的提供方上，不同密钥通常各自持有一份缓存。

## Known Limitations and Deferred Work

- **重置精度取决于适配器** —— pi-ai 路径上线缆错误被展平为消息文本，因此每日限额的停用持续到下一个 UTC 午夜；适配器给出 `providerRetryAfterMs` 时会遵循，上游共享池的直通逻辑也按稳定标记子串读取同一份展平正文。
- **停用跟踪粘滞位置而非请求** —— 并发请求共享一个进程级粘滞索引，一次失败可能停用另一个在途请求正使用到的位置；单代理会话不受影响。
- **拼错的路由 id 产生沉默的池** —— 池按名称匹配附着到路由，组合里写了没有任何族服务的路由会存下一个无人查询的池；设置编辑器只写活的提供方卡片，天然避免这一点。
- **持久化是每文档单写者** —— 停用文档没有跨进程写者锁，共享同一 `parkFile` 的两个 harness 进程会互相覆盖停用记录；需要时给每个部署独立的位置。
