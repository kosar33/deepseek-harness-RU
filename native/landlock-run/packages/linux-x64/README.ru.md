# @deepseek-ai/node-addon-landlock-run-linux-x64

[English](README.md) | [中文](README.zh.md) | Русский

Готовый лаунчер Landlock `bin/landlock-run` для linux-x64 — статический musl-бинарник, скомпилированный нативно (без кросс-тулчейна) из C-исходников, поставляемых в [`@deepseek-ai/node-addon-landlock-run`](https://www.npmjs.com/package/@deepseek-ai/node-addon-landlock-run). Поля `os`/`cpu` npm выбирают этот пакет при установке; входной пакет разрешает его до файлового пути — JavaScript он не поставляет и никогда не импортируется.

Бинарник игнорируется git'ом и попадает в npm-тарбол через список `files`; гейт `prepack` отказывается паковать, когда бинарника нет или у него неверная архитектура ELF, а релизный пайплайн побайтово привязывает упакованный бинарник к той сборке CI, из которой он пришёл. Статическая линковка musl означает один бинарник и для дистрибутивов с glibc, и для musl — потому в имени нет суффикса libc.

Родственный пакет: `@deepseek-ai/node-addon-landlock-run-linux-arm64`.
