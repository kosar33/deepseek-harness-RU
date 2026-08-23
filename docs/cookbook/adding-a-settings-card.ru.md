# Cookbook: добавление карточки настройки

[English](adding-a-settings-card.md) | [中文](adding-a-settings-card.zh.md) | Русский

Как плагин размещает собственную конфигурацию на веб-странице настроек. Этот путь не требует изменений внутри репозитория: Host раздаёт каждое зарегистрированное пространство имён настроек, а секция **Plugins** привязывает свои карточки к ключу — редактируемому ими пространству имён, поэтому плагин, зарегистрировавший обе половины, соединяется автоматически.

Обе половины живут в одном пакете — Host-половина под `src/`, браузерная под `src/client/`, экспортируемая как `./client` и объявленная через `dsh.client`. [`packages/client/ui-theme`](../../packages/client/ui-theme) — проработанный пример такой упаковки; карточки, которые поставляет этот раздел, живут в [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins).

## 1. Зарегистрируйте пространство имён (Host-половина)

Пространство имён — ключ соединения, поэтому выберите его один раз и напишите одинаково в обеих половинах. Потребителю, у которого уже есть запись в `cordis.yml`, **СЛЕДУЕТ** регистрироваться через `installSettingsSection`, которая кладёт запись под пользовательский документ и продолжает работать, когда провайдер настроек не смонтирован:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

declare function assertReachable(endpoint: string | undefined): void
declare function rebuildFromSettings(config: Config): void

export const MY_PLUGIN_NS = settingsNamespace('my-plugin')

export interface Config {
  endpoint?: string
  retries?: number
}

export const Config: z<Config> = z.object({
  endpoint: z.string(),
  retries: z.number().step(1).min(0).default(3),
})

export function apply(ctx: Context, config: Config) {
  let source = () => config
  installSettingsSection(ctx, MY_PLUGIN_NS, Config, config, {
    // Constraints the schema cannot express refuse the write, not the next use.
    validate: value => void assertReachable(value.endpoint),
    setSource: (current) => { source = current },
    onChange: () => { rebuildFromSettings(source()) },
  })
}
```

`role('secret')` на поле исключает его значение из всех ответов; карточка пишет такое поле в полезную нагрузку `update`/`mutate` либо вместо этого адресует ссылку на учётные данные через домен `credentials`. `applies: 'restart'` сообщает поверхности конфигурации, что владелец реагирует на изменение только при следующем запуске.

## 2. Зарегистрируйте карточку (браузерная половина)

Карточка регистрируется в `settings.plugin.item` под своим пространством имён и владеет всем внутри неё — обрамлением, элементами управления и текстами. Она читает и пишет через `ctx.settingsScope`, который ограждает каждую запись ревизией, прочитанной перед ней:

```ts ignore-check
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the keyed slot's declaration. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const card = new MyPluginCardController(ctx.settingsScope.bind({ namespace: 'my-plugin' }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'my-plugin',
    locale: 'settings.myPlugin',
    inject: () => card.inject(),
  }, MyPluginCard),
  )
}
```

Снапшот скоупа несёт то, что нужно форме: разрешённое `value`, композиционный `base` и сырой слой `user`, чьё **наличие** ключа — а не его значение — отмечает поле как переопределённое. `scope.set(field, value)` сохраняет одно поле, а `scope.unset(field)` очищает его обратно до композиционного слоя.

## 3. Что вкладка делает с этим

Вкладка **Plugin configuration** читает, какие пространства имён раздаёт Host, и создаёт по одному slot-ключу на пространство имён. Карточка рендерится, когда Host раздаёт её ключ, и пропускается, когда не раздаёт, поэтому развёртывание, ни разу не включившее Host-половину в композицию, не оставляет от карточки и следа. Раздаваемое пространство имён, которое не претендует ни одна карточка, не рендерит ничего — так пространства имён, которыми владеют другие страницы (`ui-theme`, `permission`, `llm-*`), остаются вне этой вкладки.

Карточки появляются в порядке регистрации в slot; запись с ключом не объявляет собственного `order`.

## Упаковка

Браузерную половину раздаёт странице [клиентская модульная система](../../packages/client/modules), которая сканирует включённые входные точки загрузчика на предмет пакетов с декларацией `dsh.client` и раздаёт собранный экспорт `./client` каждого из них. Поэтому плагин появляется на странице, как только `cordis.yml` монтирует его — без пересборки веб-приложения.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

Бандл **ДОЛЖЕН** быть артефактом ленивой CJS-фабрики загрузчика. Внутри этого репозитория `tsdown.config.ts` — три строки поверх общего пресета:

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-my-plugin', ['lib/types/index.js', 'lib/types/invariant.js'])
```

Этот пресет сегодня не опубликован, поэтому пакету вне репозитория приходится воспроизводить тот же формат вывода самостоятельно. Гейт чистоты бандла также отвергает value-импорты между плагинами, поэтому карточка не может импортировать карточное обрамление этого раздела или его модель staged-формы — она рендерит своё, а staging и ограждение ревизий реализует сама. Оба ограничения записаны в [известных ограничениях этого раздела](../../packages/client/ui-settings-plugins/README.md#known-limitations-and-deferred-work).
