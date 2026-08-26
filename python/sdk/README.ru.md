# Python SDK для DeepSeek Harness

[English](README.md) | [中文](README.zh.md) | Русский

Python SDK, управляющий DeepSeek Harness как дочерним процессом поверх JSON-RPC stdio. Рантайм наследует обычные переменные окружения DeepSeek Harness, такие как `DEEPSEEK_BASE_URL` и `DEEPSEEK_API_KEY`, поэтому вызывающие могут обращаться к реальным эндпоинтам моделей напрямую или направить эти переменные на локальный прокси.

Установите дистрибутив `deepseek-harness-sdk` с PyPI; импортируемый модуль остаётся `deepseek_harness`:

```sh
python -m pip install deepseek-harness-sdk
```

Установка `deepseek-harness-sdk` ставит платформенный wheel пакета `deepseek-harness-runtime-bin` ровно той же версии. Поэтому обычной точке входа аргумент с исполняемым файлом не нужен:

```py
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness() as harness:
    result = harness.run("Say hi.")
```

`DeepSeekHarness` удерживает лениво запущенный дочерний процесс рантайма для повторного использования между вызовами. Работайте с ним как с контекстным менеджером, как показано выше, либо явно вызовите `close()`, когда закончите.

По умолчанию SDK запускает входящий в пакет `deepseek-harness-runtime-bin` однофайловый исполняемый файл `dsh-jsonrpc-agent` и через `DSH_CORDIS_CONFIG` внедряет его конфигурацию по умолчанию (stdio-сервер JSON-RPC, ядро агента, предзагруженный адаптер DeepSeek, персистентность сессий в JSONL с явно собранной семантической политикой чекпоинтов, локальный bash). Чтобы запустить собственную композицию плагинов, сохраните запись `@deepseek-ai/dsh-sdk-jsonrpc-server` в конфиге и передайте путь к конфигу Cordis.

```py
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cordis="examples/jsonrpc-agent/cordis.yml",
) as harness:
    result = harness.run("Make the requested code change.")
```

`provider` выбирает маршрут провайдера, зарегистрированный выбранной композицией Cordis; `model` — идентификатор модели, который разрешается тем адаптером. `max_tokens` — необязательный положительный лимит выходных токенов на запрос для корневого агента и его потомков внутри процесса; отсутствие значения оставляет управление дефолту провайдера. Сводки компакции подчиняются отдельному лимиту, настроенному их плагином компакции. По умолчанию bundled-композиция регистрирует `deepseek-official`. Своя композиция может смонтировать `llm-pi-ai`, настроить там специфичные для провайдеров учётные данные и эндпоинты и выбрать любого провайдера или модель из установленного каталога pi-ai.

[Туториал по Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/python-sdk.ru.md) предлагает последовательный путь установки и первого запуска без веб-интерфейса. Полным автономным файлом Cordis, используемым там, владеет [пример `jsonrpc-agent`](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/jsonrpc-agent/README.md).

`Session.run()` владеет интервалом активности от устойчивого попадания своего промпта в inbox до следующего полного простоя агента и возвращает `RunResult(session_id, final_response, finish_reason, events, notifications, session_root)`. `final_response` — последний закоммиченный текст ассистента корневой сессии в этом интервале. `finish_reason` — поле `kind` последнего `turn/end` корневой сессии в интервале, например `completed`, `max-tokens` или `error`, и `None`, если ни один ход не завершился. `turn/end` без строкового `data.reason.kind` нарушает протокол рантайма и вызывает `SdkProtocolError`. Оба поля результата описывают этот интервал, находящийся в ведении Session.run(), а не выход или завершение, причинно назначенные промпту. Steering, внедрённый контекст и прочая поставленная в очередь работа могут внести вклад до наступления простоя.

`HarnessClient` хранит обнаруженную родословную субагентов всё время жизни процесса рантайма. Во время каждого `Session.run()` `RunResult.notifications` и `on_notification` получают уведомления корневой сессии и всех известных потомков в порядке их следования по протоколу, включая вложенные события жизненного цикла субагентов и события сессий. `RunResult.events` содержит только события корневой сессии, поэтому сообщения потомков не могут вытеснить ответ корня. Низкоуровневый `session_prompt()` немедленно возвращает поставленный в очередь `MessageId`; вызывающие в обход `Session.run()` сами владеют всеми последующими границами активности.

То же поведение можно выбрать для дочернего процесса рантайма через `DSH_CORDIS_CONFIG`. Внедрение живёт в `HarnessClient.start()`, поэтому внедрение действует и при запуске по умолчанию низкоуровневого клиента: когда запуск разрешается в bundled-рантайм и не задан ни `cordis`, ни непустой `DSH_CORDIS_CONFIG` (рантайм трактует пустое значение как отсутствие, и проверка внедрения делает то же самое), используется bundled-конфигурация по умолчанию; явные `runtime_bin`, `bridge_bin` или `launch_args_override` отключают внедрение целиком. О носителях рантайма (production-exe против dev-only node-замыкания) и способах их получения читайте в [README sdk-runtime](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk-runtime/README.ru.md).

`cwd` и `runtime_cwd` разрешаются в абсолютные пути до запуска дочернего процесса, внедрения окружения и рукопожатия по протоколу. Публичный API предоставляет только применённые опции: персона развёртывания и персистентность живут в `cordis.yml`, а `session_root` остаётся высокоуровневым удобством, задающим `DSH_SESSION_ROOT`.
