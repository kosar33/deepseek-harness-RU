<!-- Английский источник генерируется скриптом scripts/gen-doc-graphs.ts; этот русский файл — сопровождаемая парная сторона.
     При обновлении сначала выполните `pnpm run gen-doc-graphs` для английской стороны, затем обновите этот файл. -->

# Индекс графов документации

[English](graph-atlas.md) | [中文](graph-atlas.zh.md) | Русский

Эти диаграммы показывают отношения, которых не показывают сгенерированные каталоги. Используйте их, чтобы находить связи пакетов, capability seam'ы, потоки событий, обращённые к модели инструменты, композицию приложений и пути жизненного цикла рантайма. Точные сигнатуры и определения типов по-прежнему живут на [страницах подсистем](subsystems/core.md) (типы + сгенерированные области Cordis API) и в [tool-catalog.md](tool-catalog.md).

Процессное решение, стоящее за этим индексом, записано в [Agent Note о графе документации](../.agents/notes/archived/process/2026-07-03-documentation-graph-atlas.md).

| Граф | Режим |
| --- | --- |
| [граф зависимостей модулей](module-graph.md) | `generated` |
| [каталог схем инструментов и карта пакетов](tool-catalog.md) | `generated` |
| [capability seam'ы и основные сервисы](capability-seams.md) | `hybrid generated` |
| [композиция общей базы dsh](../apps/cli/composition.md) | `hybrid generated` |
| [композиция приложения headless-agent](../examples/headless-agent/composition.md) | `hybrid generated` |
| [композиция приложения acp-agent](../examples/acp-agent/composition.md) | `hybrid generated` |
| [матрица производителей/потребителей событий](event-producer-consumer.md) | `hybrid generated` |
| [жизненный цикл хода и шага агента](agent-lifecycle.md) | `curated` |
| [пайплайн исполнения инструментов](tool-execution-pipeline.md) | `curated` |

Перегенерируйте командой `pnpm run gen-doc-graphs`; проверяйте актуальность командой `pnpm run verify-doc-graphs`.

Режим сопровождения: mixed: каждая связанная страница объявляет режим generated, hybrid или curated.
