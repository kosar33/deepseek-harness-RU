# Agent Note: 轮换停用从展平的提供方正文中读取重置提示

Status: implemented

[English](2026-08-26-key-rotation-body-reset-hints.md) | 中文

## Problem

在 pi-ai 路径上，线缆错误到达恢复缝时已被展平为消息文本，适配器给出的 `providerRetryAfterMs` 永远缺席，于是每次 pi-ai 限流都把密钥停用到下一个 UTC 午夜——把每日额度的回退套用到了小时级与分钟级限额上。停用可能比真实限制多活数小时，耗尽列表与 GUI 携带的也是这个错误时刻。

## Decision

`resetFromFailure` 保持适配器已验证的 `providerRetryAfterMs` 最优先，随后扫描展平消息中三个有真实提供方先例的标记族：`reset_at` / `x-ratelimit-reset` ISO 时间戳、带引号或裸写的 `retry-after` 秒值（`ms` 后缀切换单位），以及 OpenAI 的「try again in Ns」措辞。每个解析出的候选都必须有限、严格在未来、且落在失败后一周之内——其余一律按垃圾处理并继续扫描。无可解析标记的正文与从前完全一致地回退到下一个 UTC 午夜；选择次序与其余池行为不动，函数保持对 `(message, now)` 纯净，无新增配置。

## Alternatives considered

**经 pi-ai 传递结构化失败字段** —— 否决：头部在插件上游的展平中被销毁，不改 dsh-llm-pi-ai 的公开失败契约就无法在此找回精度，而该契约变更没有现任所有者。

**按提供方的解析器注册表** —— 因缺少第二个消费者而否决：三个标记族已覆盖提供方实际内嵌的形态，未知形态本就安全降级到午夜回退。

**对超尺寸提示做钳制而非拒绝** —— 否决：超出任何合理额度窗口的值意味着匹配到的是共享该措辞的另一构造，而非更长的停用；钳制会把解析伪影变成状态。
