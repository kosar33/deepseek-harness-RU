# sdk/ — управление рантаймами Harness из другого процесса

[English](README.md) | [中文](README.zh.md) | Русский

Эта группа содержит стек протоколов для управления рантаймом Harness из другого процесса. Вызывающая сторона поставляет исполняемый файл рантайма и его `cordis.yml`; группа не создаёт, не конфигурирует, не собирает и не запускает проекты разработчиков. Клиентским контрактом владеет [решение о TypeScript SDK](../../.agents/notes/implemented/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md), а продуктовой границей — [решение об удалении тулчейна проектов](../../.agents/notes/implemented/simplification/2026-08-11-remove-sdk-project-toolchain.md).

| Пакет | Роль |
|---|---|
| [`protocol/`](protocol/README.ru.md) | Определяет формат протокола рантайма SDK |
| [`client/`](client/README.ru.md) | Управляет рантаймом Harness через клиентский API TypeScript |
| [`server/`](server/README.ru.md) | Обслуживает внепроцессных клиентов SDK по stdio JSON-RPC |
