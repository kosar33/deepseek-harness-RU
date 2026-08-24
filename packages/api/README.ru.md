# api/ — слои Remote API

[English](README.md) | [中文](README.zh.md) | Русский

Стек Remote, обращённый к приложениям. `remotes` владеет политикой BFF и выбранной бизнес-API, а `gateway` реализует унарные RPC-эндпоинты Typert, общие для окружений Host и Client.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`remotes/`](remotes/README.ru.md) | Политика поиска Agent/Session на стороне Host и сборка вклада Client Remote | нет сервиса; конфигурирует `ctx.typert` и использует `ctx.remote` |
| [`gateway/`](gateway/README.ru.md) | Диспетчер Typert на стороне Host и эндпоинт Client Remote | `ctx.typertGateway` / `ctx.remote` |

Направление рантаймных зависимостей — `remotes → gateway → connection → webserver`: BFF использует общий контракт `TypertClientRemote`, Gateway делегирует транспорт Connection, а Connection монтируется на HTTP-сервере. Инъекция сервисов Cordis и метаданные клиентских модулей сохраняют этот порядок без импорта конкретного Gateway из клиентской точки входа Remotes.

## Известные ограничения и отложенная работа

- Connection и WebServer остаются в [`client/connection`](../client/connection/README.ru.md) и [`host/webserver`](../host/webserver/README.ru.md); последующий перенос на уровне пакетов сможет разместить их под `api/connection` и `api/webserver` без изменения их сервисных контрактов.
- Унаследованный API Proxy остаётся в [`host/apiproxy`](../host/apiproxy/README.ru.md) как запасной путь для методов, ещё не переведённых на Remote. Он использует хостовый резолвер, принадлежащий `api-remotes`, поэтому перенесённые и унаследованные методы сохраняют единую политику идентичности Agent/Session.
