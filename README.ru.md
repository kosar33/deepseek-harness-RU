# DeepSeek Harness

[English](README.md) | [中文](README.zh.md) | Русский

DeepSeek Harness (`dsh`) — harness с открытым исходным кодом для ИИ-агентов, разработанный [DeepSeek AI](https://deepseek.com).

Он использует архитектуру, в которой **всё является плагином**, и работает на базе [Cordis](https://github.com/cordiverse/cordis), чей дизайн описан в работе [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Предварительная версия для разработчиков

DeepSeek Harness сейчас находится в стадии _предварительной версии для разработчиков_ и быстро развивается. **БУДУТ ИЗМЕНЕНИЯ, НАРУШАЮЩИЕ СОВМЕСТИМОСТЬ.**

## Запуск

### Запуск из npm

Установите Node.js, затем выполните:

```sh
npx @deepseek-ai/dsh web
```

Команда по умолчанию запускает веб-интерфейс на `http://127.0.0.1:3080` и при локальном запуске открывает его в браузере по умолчанию. При запуске через SSH выводится только URL хоста, потому что адрес локального проброса контролирует SSH-клиент или редактор. Укажите `--no-open`, чтобы запустить сервер без открытия браузера. См. [руководство по веб-интерфейсу](docs/user/guide/index.ru.md).

### Запуск из исходников

Чтобы запустить проект из рабочей копии репозитория:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` готовит артефакты репозитория. `pnpm dsh web` использует эти собранные артефакты без пересборки.

## Сообщество и поддержка

- Не стесняйтесь отправлять отзывы и сообщения об ошибках через [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Добавьте тему [`dsh-plugin`](https://github.com/topics/dsh-plugin) в репозиторий вашего плагина, чтобы другие могли его найти.
- Присоединяйтесь к <a href="https://discord.gg/Ycq5dCaS4">сообществу DeepSeek Harness в Discord</a>.

## Участие в разработке

См. [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md).

## Разработка

Начните с [руководства по разработке](docs/development.ru.md) и [документации по архитектуре](docs/architecture.ru.md).

Для агентов — следуйте [AGENTS.md](AGENTS.md).

## Лицензия

[MIT](LICENSE)

Сторонние зависимости и их лицензии раскрыты в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
