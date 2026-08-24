# plan/ — состояние совместной работы над планом

[English](README.md) | [中文](README.zh.md) | Русский

Режим плана — журналируемое состояние совместной работы отдельного агента, а не универсальный реестр режимов и не capability seam.

| Пакет | Роль | ctx-ключ |
|---|---|---|
| [`plan-mode/`](plan-mode/README.ru.md) | Владеет состоянием режима плана, руководством, командами и потоком рецензирования | `ctx.planMode` |

Решение [состояние совместной работы, специфичное для плана](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md) фиксирует дизайн семейства.

Справочник подсистем — свёртка `plan/mode`, сброс на границе шага, конфигурация, инструмент выхода — это [docs/subsystems/plan.ru.md](../../docs/subsystems/plan.ru.md); дизайн — в [состоянии совместной работы, специфичном для плана](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md).
