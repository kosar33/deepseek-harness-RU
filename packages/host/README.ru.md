# host/ — хостовая половина веб-GUI

[English](README.md) | [中文](README.zh.md) | Русский

Хостовая сторона веб-GUI dsh: шлюз API, общий для всех клиентских форм, и простой HTTP-сервер, на котором этот шлюз работает. Браузерная сторона находится в [`client/`](../client/README.ru.md); собранное приложение — это [`apps/cli`](../../apps/cli/README.md), загружающее [бандл `dsh-base`](../bundle/base/cordis.patch.yml) и обслуживающее [`apps/web`](../../apps/web/). Все эти пакеты — **продуктовые**.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`apiproxy/`](apiproxy/README.ru.md) | Общий хостовый API-шлюз и контракт протокола | `ctx.apiProxy` |
| [`webserver/`](webserver/README.ru.md) | Носитель HTTP-маршрутов | `ctx.webServer` |
| [`frontend-static/`](frontend-static/README.ru.md) | Сервер SPA-дистрибутива на запасном месте веб-сервера | использует `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.ru.md) | Capability seam выбора каталога рабочей области | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.ru.md) | Нативный бэкенд выбора каталога и браузерное взаимодействие | регистрирует `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.ru.md) | Бэкенд обзора каталогов внутри приложения и его взаимодействие | регистрирует `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.ru.md) | Подстраивающаяся под хост композиция механизма выбора | монтирует бэкенд |
| [`plugin-inventory/`](plugin-inventory/README.ru.md) | Проекция текущих записей Loader только для чтения | Remote `pluginInventory/list` |

`apiproxy` остаётся независимым от транспорта; носитель «браузер/HTTP» предоставляет [`client/connection`](../client/connection/README.ru.md). Реализации механизма выбора сменяют друг друга за общим capability seam.

Справочники подсистемы: [web-server.ru.md](../../docs/subsystems/web-server.ru.md) и [workspace.ru.md](../../docs/subsystems/workspace.ru.md) (seam выбора каталога).
