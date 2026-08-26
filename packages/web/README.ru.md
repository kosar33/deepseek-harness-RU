# web/ — семейство web-возможности

[English](README.md) | [中文](README.zh.md) | Русский

Это семейство предоставляет независимые от провайдера операции веб-поиска и загрузки, а также обращённые к модели инструменты, использующие их.

| Пакет | Роль | Ключ ctx |
|---|---|---|
| [`web/`](web/README.ru.md) | Определяет регистрацию провайдеров web, выбор и общие ошибки | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.ru.md) | Даёт веб-поиск через Exa | регистрируется на `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.ru.md) | Даёт веб-поиск через Perplexity | регистрируется на `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.ru.md) | Даёт нативный веб-поиск DeepSeek | регистрируется на `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.ru.md) | Загружает публичные ресурсы HTTP и HTTPS | регистрируется на `ctx.web` |
| [`tool-web/`](tool-web/README.ru.md) | Открывает веб-поиск и загрузку для модели | регистрируется на `ctx.tools` |

[Решение о web-возможности](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) записывает, почему поиск и загрузка делят один сервис выбора провайдера.

Справочник подсистемы — запросы и результаты поиска/загрузки, доступность, `WebError` — живёт в [docs/subsystems/web.ru.md](../../docs/subsystems/web.ru.md); обоснование (включая отложенную защиту от SSRF) — в [Agent Note о seam'е web-возможности](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md).
