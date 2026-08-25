# Agent Note：Todo 计划跨轮次保留

Status: implemented

[English](2026-08-25-todo-plan-persists-across-turns.md) | 中文

## 问题

轮次边界清除规则在每个 `turn/start` 都会清掉渲染中的计划条。真实会话两次打破这一生命周期假设。其一，目标横跨多个轮次——用户每次回复都开启新轮次，进行中的清单在回复之间凭空消失，而工作本身毫无变化。其二，出错的轮次恰好在操作者最需要清单时把它抹掉：工作未完成，下一轮次必须续做，重建清单的负担落在模型或用户身上。2026-08-25 用户报告（rotation-key 工作期间）：出错后任务被重置，手工重录是唯一恢复手段。

## 决策

`todos` 投影回归会话级 last-write-wins：`apply` 从每个 `todo/write` 取整表，任何事件都不清除它，仅在任何写入之前为 `null`（`stateVersion` 3）。已完成的清单留在屏幕上可以接受——它记录上一个任务做了什么，并在下一个任务的首次写入时被替换，而工具契约本就要求「每次发送整个列表」。清除现在是模型的写作动作，绝不是自动生命周期规则。

### 宿主投影（web）

同一单元、同一载体：`dsh-tool-todo` 只按最新写入折叠；`dsh-host-apiproxy` 在尾页提供该值并推送 `session/projection` 帧；web dock 经 `useProjection('todos')` 读取。无钥匙 connection-fixture 镜像去掉其 `turn/start` 停止点，使组装页面收敛到同一值。

## 已考虑的替代方案

- **除失败/中断轮次外保留清除** —— 保留反陈旧意图，但把决定藏进清单读者看不见的轮次结束原因里，且仍会抹掉干净暂停的多轮次目标。
- **仅当所有条目完成时才在 `turn/start` 清除** —— 同样的隐藏状态问题，何况旧规则下真正完成任务的部分清单本来也会残留。
- **面向模型的显式清除命令** —— 无必要：整表重写本身就是清除。

## 后果

计划条跨轮次显示最后写入的计划，错误也不例外；只要存在过写入，重新打开会话即可恢复。取代并归档 2026-07-28 的轮次清除 note（冻结于 `archived/feature/2026-07-28-todo-plan-clears-on-next-turn.md`），恢复 [web todo 展示](2026-07-23-web-todo-display.zh.md) note 的会话级常驻措辞；该 note 继续拥有渲染表面。覆盖：投影 spec 固定列表在 `turn/end` + `turn/start` 边界后的存活；fixture 镜像与宿主折叠收敛；既有展示快照保持有效，因为 fixture 的 todo 轮次即其最后一轮。
