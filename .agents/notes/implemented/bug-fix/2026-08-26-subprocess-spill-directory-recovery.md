# Agent Note: Recreate a deleted spill directory at spawn

Status: implemented

English | [中文](2026-08-26-subprocess-spill-directory-recovery.zh.md)

The local subprocess provider resolved its spill directory once and assumed it stayed alive for the host process. Anything that removes a directory under the platform temp root — OS temp cleaners, manual wipes, another harness instance sharing the root — left the recorded path dangling, and the next spawn crashed the host instead of degrading.

## Decision

### Spawn ensures the spill directory exists; the check is per launch

`spawn.ts` re-materializes the configured spill directory whenever it is missing at launch, using the same private-permission creation as first-time setup. There is no watcher and no write-time retry: a directory deleted between spawn and output collection still loses that command's full-output recovery, which matches the existing lossy-read contract. The fix targets only the crash — an absent directory is now a recoverable condition at the one point the provider controls.

### The void collector callback keeps its braces

The collector's empty-callback arm gained explicit braces so a future statement cannot silently become its body; behavior is unchanged.
