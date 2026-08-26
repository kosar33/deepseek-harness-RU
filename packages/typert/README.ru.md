# Typert

[English](README.md) | [中文](README.zh.md) | Русский

Typert разделяет анализ исходников, рантайм-хранилище и обнаружение со стороны Loader.

| Пакет | Роль | Ключ Cordis |
|---|---|---|
| [`registry/`](registry/README.ru.md) | Хранит рантайм-рефлексию пакетов и схемы | `ctx.typert` |
| [`loader/`](loader/README.ru.md) | Обнаруживает записи Loader и регистрирует сгенерированные хостовые артефакты | использует `ctx.loader` и `ctx.typert` |
| [`generator/`](generator/README.ru.md) | Генерирует рантайм-артефакты из исходных типов | библиотека времени сборки |
