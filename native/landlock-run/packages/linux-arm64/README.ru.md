# @deepseek-ai/node-addon-landlock-run-linux-arm64

[English](README.md) | [中文](README.zh.md) | Русский

Предварительно собранный Landlock-запускатель `bin/landlock-run` для linux-arm64 — статический musl-бинарник, скомпилированный нативно (без кросс-тулчейна) из C-исходников, поставляемых в [`@deepseek-ai/node-addon-landlock-run`](https://www.npmjs.com/package/@deepseek-ai/node-addon-landlock-run). Поля `os`/`cpu` npm выбирают этот пакет при установке; entry-пакет разрешает его до пути к файлу — он не поставляет JavaScript и никогда не импортируется.

Бинарник в git-игноре и едет в npm-тарболле через список `files`; гейт `prepack` отказывается паковать, когда его нет или у него неверная ELF-архитектура, а релизный пайплайн побайтово сличает упакованный бинарник с той сборкой CI, из которой он вышел. Статическая линковка musl означает один бинарник для дистрибутивов и с glibc, и с musl — отсюда отсутствие суффикса libc в имени.

Собрат: `@deepseek-ai/node-addon-landlock-run-linux-x64`.
