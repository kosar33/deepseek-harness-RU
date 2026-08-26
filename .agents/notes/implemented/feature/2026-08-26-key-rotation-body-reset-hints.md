# Agent Note: Body-derived reset hints for key-rotation parks

Status: implemented

English | [中文](2026-08-26-key-rotation-body-reset-hints.zh.md)

## Problem

Through the pi-ai path wire errors arrive at the recovery seam flattened to message text, so the adapter-surfaced `providerRetryAfterMs` never arrives and every pi-ai rate limit parked its key until the coming UTC midnight — the daily-quota fallback applied to hourly and per-minute limits as well. A park could outlive its real limit by many hours, and the exhaustion listing and GUI carried that wrong instant.

## Decision

`resetFromFailure` keeps the adapter's validated `providerRetryAfterMs` first and then scans the flattened message for three marker families with real provider precedent: `reset_at` / `x-ratelimit-reset` ISO stamps, `retry-after` seconds values quoted or bare (an `ms` suffix switches the unit), and OpenAI's "try again in Ns" phrasing. Every parsed candidate must be finite, strictly in the future, and within one week of the failure — anything else is treated as garbage and scanning continues. Bodies without a parsable marker fall back to the coming UTC midnight exactly as before; the selection order and all pool behavior are otherwise untouched, and the function stays pure over `(message, now)` with no new configuration.

## Alternatives considered

**Structured failure fields through pi-ai** — rejected: headers are destroyed by the flattening upstream of this plugin, so precision cannot be recovered here without changing dsh-llm-pi-ai's public failure contract, which has no current owner for that change.

**A per-provider parser registry** — rejected for lack of a second consumer: the three families cover the marker shapes providers actually embed, and unknown shapes already degrade safely to the midnight fallback.

**Clamping oversized hints instead of rejecting them** — rejected: a value beyond any plausible quota window means the match is a different construct sharing the marker's wording, not a longer park; clamping would turn a parsing artifact into state.
