# Воркфлоу для контрибьюторов Python

[English](development.md) | [中文](development.zh.md) | Русский

Выбирайте воркфлоу по нужному вам результату контрибьютора: собрать артефакты рантайма, проверить SDK, запуститься против исходников или собрать дистрибутивы. За поведение пакетов отвечают [справочник SDK](sdk/README.ru.md) и [справочник носителей рантайма](sdk-runtime/README.ru.md).

## Сборка артефактов рантайма

Исполняемые файлы платформ — это артефакты сборки, и в git они не попадают. Запускайте сборку из корня репозитория:

```sh
pnpm install
pnpm exec tsx scripts/build-exe-for-python-sdk.ts
```

Используйте `--skip-build`, когда требуемые артефакты `lib/` уже существуют, а `--targets=node24-linux-x64,node24-linux-arm64,node24-macos-arm64` выбирает целевые платформы. Продукты попадают в `dist-exe/`, после чего скрипт синхронизирует выбранные носители в `python/sdk-runtime/`. Сборки под macOS дополнительно синхронизируют соответствующий spawn-helper, который требуется `node-pty`.

## Проверка SDK

Держите виртуальное окружение вне `python/`, установите группу test и запустите набор тестов на Python:

```sh
export UV_PROJECT_ENVIRONMENT="$PWD/tmp/py-sdk-venv"
uv sync --project python/sdk --group test
uv run --project python/sdk pytest
```

`python/sdk/tests/test_bundled_runtime.py` задействует доступные bundled-носители и пропускает носитель, если его артефакт ещё не собран. Общерепозиторная политика тестирования описана в [Тестировании](../docs/testing.ru.md).

Этот набор работает с фальшивыми партнёрами рантайма. `scripts/smoke-python-runtime.py` вместо этого управляет настоящим упакованным рантаймом, а обязательное CI-задание `python-runtime` прогоняет каждый сценарий против свежесобранного исполняемого файла:

```sh
uv run --project python/sdk python scripts/smoke-python-runtime.py \
  --scenario sdk-minimal --exe dist-exe/dsh-jsonrpc-agent-pkg-macos-arm64
```

Два сценария сравниваются с зафиксированным ожидаемым результатом в `scripts/snapshots/python-sdk-single-exe/`. Файл `minimal/model-visible.json` фиксирует для входящей в репозиторий минимальной композиции собранные системные промпты, объявляемые схемы инструментов и сообщения, видимые модели, поэтому плагин, добавляющий нежданную секцию системного промпта или сообщение пользователя, заставит задание упасть; этот сценарий опускает динамический снапшот контекста рантайма, который та же композиция выдаёт на macOS и не выдаёт на Linux ([#2488](https://github.com/deepseek-harness/deepseek-harness/issues/2488)). Каталог `advanced/` фиксирует результат SDK и сохранённые журналы сессий. Перепрогоните соответствующий сценарий с `--update-snapshots` и просмотрите этот дифф до коммита.

Интерактивному смоук-тесту нужен `DEEPSEEK_API_KEY` в окружении или в `.env` корня репозитория:

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness() as harness:
    print(harness.run("say hi").final_response)
```

## Запуск против исходников Node

Контрибьюторы репозитория могут выбрать любой из двух development-носителей:

- Задайте `DSH_RUNTIME_MODE=node`, чтобы использовать собранный Node-носитель на системном Node `>=22.19`. Скрипт сборки обновляет этот носитель, но дистрибутивы никогда его не включают и не выбирают автоматически.
- Задайте `launch_args_override=("./node_modules/.bin/tsx", "packages/examples/jsonrpc-demo/src/bin.ts")` с корнем репозитория в качестве `cwd`, чтобы запускать несобранный исходный TypeScript. Передайте `cordis=...`, если конфигурация по умолчанию не подходит.

Полный пример вызова в режиме исходников смотрите в `python/sdk/tests/manual_sdk_agent_smoke.py`.

## Сборка дистрибутивов

Версия корневого `package.json` — источник истины для обоих Python-дистрибутивов. Скрипт подготовки внедряет эту версию в оба wheel-пакета и привязывает SDK к той же версии `deepseek-harness-runtime-bin`.

Соберите чистый wheel пакета SDK один раз и по одному wheel рантайма на каждой родной платформе:

```sh
version="$(python - <<'PY'
import runpy

release = runpy.run_path("scripts/build-python-release.py")
print(release["pep440_version"](release["repository_version"]()))
PY
)"
python scripts/build-python-release.py --package sdk --output-dir dist-python
python scripts/build-python-release.py --package runtime --platform macos-arm64 --runtime-exe dist-exe/dsh-jsonrpc-agent-pkg-macos-arm64 --output-dir dist-python
pip install \
  "dist-python/deepseek_harness_sdk-$version-py3-none-any.whl" \
  "dist-python/deepseek_harness_runtime_bin-$version-py3-none-macosx_14_0_arm64.whl"
```

Рантайм-дистрибутив распространяется только как wheel. Пайплайн релиза публикует три платформенных wheel-пакета вместе с чистым wheel пакета SDK: Linux x64, Linux arm64 и macOS 14 или новее на arm64. Тег `python-v<repository-version>` принимается, только когда совпадает с версией репозитория; prerelease-версии репозитория вроде `0.0.1-rc.1` внутри имён файлов wheel и метаданных используют нормализованную запись PEP 440, например `0.0.1rc1`.

## Проверка кандидата в релизы

Повесьте на pull request метку `python-release-dry-run` либо вручную запустите воркфлоу GitHub `Release (Python)` с `publish=false`: оба пути собирают все четыре wheel-пакета, устанавливают релизный набор для Linux на Python 3.10 и 3.14, сверяют точные имена файлов и метаданные, применяют стандартный лимит PyPI на размер одного файла и сохраняют один сводный артефакт с хэшами SHA-256. У обоих путей нет учётных данных реестра; запуск от pull request не может попасть ни в одно из заданий публикации.

Публичная публикация выполняется из приватного репозитория автоматизации; метаданные пакетов указывают на отдельное публичное зеркало исходников только для чтения, которое релизные Actions не запускает. Приватный репозиторий определяет переменную репозитория `PYPI_PUBLISHER_REPOSITORY` как собственные `owner/name` и держит `PUBLIC_PYPI_RELEASE_ENABLED=false`, кроме намеренных релизов.

Раздельные задания рантайма и SDK позволяют продолжить после неудачной загрузки SDK, не отправляя неизменяемые файлы рантайма заново. Они принимают `publish=true`, только когда воркфлоу запускается из настроенного репозитория-издателя на совпадающем теге `python-v*` и защищённые окружения `pypi-runtime` и `pypi` санкционируют задания рантайма и SDK соответственно. PyPI Trusted Publishing по-прежнему поставляет короткоживущие учётные данные OIDC, но публичные аттестации отключены: они раскрыли бы личность приватного издателя.
