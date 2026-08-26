# Agent Note: Localizing web command and card copy through dictionaries

Status: implemented

English | [中文](2026-08-26-web-command-and-card-copy-localization.zh.md)

Three web surfaces still hardcoded English strings at their render sites: tool-card copy (the diff/read/search/web blocks), the running-turn status label, and the slash-menu rows whose descriptions arrived verbatim from the host command catalog. Each now resolves its copy through the client locale runtime, so a deployment's language choice covers the whole composer surface without touching host-side strings. This extends the [client locale full rollout](../architecture/2026-07-30-client-locale-full-rollout.md) doctrine — atoms take copy as props, plugins resolve from their own `t` seat — to surfaces that postdate it; nothing in that record is reversed.

## Decision

### Tool cards take their labels through props

`DiffBlock`, `ReadBlock`, `SearchBlock`, and `WebBlock` accept a labels prop that `ui-tool` builds from the shared dictionary; the block components stay pure presentation and never bind locales themselves. Key construction lives in one `block-labels.ts` module, so adding a card means adding one dictionary entry, not editing a component.

### The running-turn status label rides the conversation dictionary

The status line above a streaming answer resolves through the conversation namespace like every other Chat row, instead of its private literal.

### Slash-menu descriptions localize by command name; unknown keeps host copy

A new `command.description` locale namespace keys rows as `cmd.<name>` for the known host commands (`compact`, `goal`, `permission`, `feedback`, `export`, `plan`). Candidate synthesis asks the translator for `cmd.<name>` and falls back to the host catalog description when the translation echoes the requested key — the dictionary-miss signal. A host command added later therefore degrades to English until a dictionary line lands, never to a broken row.
