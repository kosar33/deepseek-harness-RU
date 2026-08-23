# Счётчик токенов

[English](token-meter.md) | [中文](token-meter.zh.md) | Русский

`@deepseek-ai/dsh-token-meter` предоставляет один отсоединённый снапшот воспроизведения для давления запроса и позиционного ценообразования поверхности (surface). `logRevision` — число долговременных событий, потреблённых для каждого поля измерения.

Источник: [`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: number
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total heuristic tokens across the current surface. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

`baseline.kind === 'usage'` означает, что последний успешный вызов провайдера имеет тот же канонический конверт запроса, а его итог не ниже полного эвристического якоря этого вызова. `estimated` означает, что переиспользуемого консервативного якоря расхода нет, поэтому сервис оценил весь конверт и поверхность своей фиксированной эвристикой. Более поздний успешный запрос заменяет прежний якорь; знаковый `surfaceDeltaTokens` сохраняет и рост, и сокращение относительно совпавшего якоря. `totalTokens` остаётся давлением запроса и ответа, тогда как `surfaceTokens` — эвристический итог только по поверхности, равный сумме цен узлов.

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: number
  /** Heuristic tokens for the exact message projected by this node. */
  readonly tokens: number
}
```

Порядок поверхности авторитетен: у замещающих узлов долговременные seq бывают выше, чем у позиционно более поздних узлов. Снапшот неизменяем и не растёт, пока продвигается лежащая под ним свёртка воспроизведения.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtokenmeter--tokenmeter"></a>

### `ctx.tokenMeter` — `TokenMeter`

Replay owner for one service-wide estimator and isolated per-session folds.

```ts cordis-catalog
/**
 * Measure current request pressure and surface through the durable tail.
 *
 * Provider usage is reused only when the latest successful call's canonical
 * request envelope matches `requestHeader` and its total is no lower than
 * that call's full heuristic anchor; otherwise the complete envelope and
 * surface are heuristically repriced.
 *
 * `requestHeader` affects request pressure only; surface fields always
 * describe the current session surface. Every call clones those positional
 * nodes, so measurement is O(surface).
 *
 * @param session - session to replay through its current durable tail.
 * @param requestHeader - optional effective request envelope replacing the latest logged header.
 * @returns a detached deeply immutable pressure and surface measurement.
 */
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement

/**
 * Heuristically price one model-visible message (instance face of the pure
 * `estimateMessage` export from `estimate.ts`).
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed service heuristic.
 */
estimateMessage(message: Message): number
```

Types: [EpochHeader](session.md) · [Message](llm-streaming.md) · [Session](session.md)

Source: [`packages/llm/token-meter/src/index.ts`](../../packages/llm/token-meter/src/index.ts)
<!-- END GENERATED cordis-surface -->
