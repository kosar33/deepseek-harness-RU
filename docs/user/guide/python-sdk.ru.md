# Знакомство с Python SDK

[English](python-sdk.md) | [中文](python-sdk.zh.md) | Русский

Этот туториал — программная альтернатива веб-интерфейсу. Он устанавливает опубликованный Python SDK, запускает входящий в репозиторий пример композиции агента и показывает, как вызывать тот же API из собственной программы.

## Предварительные требования

- Python 3.10 или новее
- Git
- Linux x64, Linux arm64 или macOS 14 или новее на arm64
- Совместимый с DeepSeek эндпоинт API и учётные данные
- Изолированная рабочая область, которую агент может изменять

## Установка SDK

Склонируйте репозиторий ради его запускаемого примера, создайте виртуальное окружение и установите SDK с одноимённой версией bundled-рантайма:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

Установленному рантайму не нужен системный Node.js. Контрибьюторам репозитория, которым нужно собрать рантайм или wheel-пакеты из исходников, следует воспользоваться [рабочими процессами для контрибьюторов Python](../../../python/development.md).

## Запуск входящего в репозиторий примера

Задайте учётные данные в окружении. Также задайте `DEEPSEEK_BASE_URL`, если модель обслуживается OpenAI-совместимым прокси, а не стандартным эндпоинтом DeepSeek.

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
# export DSH_MODEL=deepseek-v4-flash
# export DSH_SYSTEM_PROMPT='You are a helpful software engineer assistant.'
```

Запустите одну задачу против изолированных рабочей области и каталога сессий:

```sh
python examples/jsonrpc-agent/minimal.py \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/path/to/sessions \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

Скрипт печатает финальный ответ ассистента. Каталог сессий получает JSONL-журнал, содержащий собранные запросы к модели и вызовы инструментов.

## Использование SDK в собственной программе

Входящий в репозиторий пример — тонкая обёртка вокруг этого вызова SDK:

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

config = Path("examples/jsonrpc-agent/minimal.cordis.yml").resolve()
workspace = Path("/absolute/path/to/workspace").resolve()
sessions = Path("/absolute/path/to/sessions").resolve()

with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    session_root=str(sessions),
    cordis=str(config),
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

`DeepSeekHarness` лениво запускает bundled-рантайм и переиспользует его до выхода из контекстного менеджера. Повторное использование того же harness и id сессии сохраняет принадлежащий сессии процесс Bash, включая его рабочий каталог, экспортированные переменные и функции оболочки. Для независимой задачи используйте свежий id сессии; переиспользуйте id только тогда, когда следующий вызов должен продолжить то же долговременное диалоговое состояние.

## Как устроена композиция примера

| Свойство | Значение |
|---|---|
| Системный промпт | `DSH_SYSTEM_PROMPT`, с fallback на `You are a helpful software engineer assistant.` |
| Модель в `minimal.py` | `--model`, затем `DSH_MODEL`, затем `deepseek-v4-flash` |
| Инструменты, доступные модели | Только постоянные `bash` и `str_replace_editor` |
| Тайм-аут Bash | 300 секунд |
| Лимит вывода редактора | 16 000 символов |
| Компакция контекста | Отключена |
| Файловая система | Bare-бэкенд локальных файлов; абсолютные пути редактора могут адресовать любой путь, видимый процессу рантайма |
| Персистентность сессии | Несжатый JSONL под `DSH_SESSION_ROOT` |

Композиция опускает идентификацию harness, текст промпта рабочей области, скиллы, одноразовый Bash, задачные инструменты, компакцию и все прочие видимые модели плагины. Факты политики песочницы записываются в журнал как пользовательский контекст рантайма, а не добавляются в системный промпт.

## Выбор workspace и идентификаторов сессий

`cwd` выбирает рабочую область, доступную агенту, а `session_root` хранит журналы и состояние сессий. Для независимой задачи используйте свежий id сессии; переиспользуйте id только тогда, когда следующий вызов должен продолжить тот же диалог и состояние постоянной оболочки.

Композиция использует `danger-full-access`. Запускайте её только внутри одноразового checkout или контейнера: Bash и редактор могут изменять любой путь, разрешённый процессу рантайма. Постоянный PTY-бэкенд требует POSIX-терминала, поэтому эта композиция не поддерживает агентов на Windows.

За точную композицию отвечает справочник примера [`jsonrpc-agent`](../../../examples/jsonrpc-agent/README.md). [Справочник Python SDK](../../../python/sdk/README.md) описывает жизненный цикл, результаты, уведомления, выбор рантайма и конфигурацию; [primer по Cordis](../../cordis-primer.md) описывает синтаксис композиции.
