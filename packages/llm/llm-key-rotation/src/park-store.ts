/**
 * Durable park-state file for the rotation plugin. Parks must survive
 * restarts — the agent server does not run continuously, so an in-memory-only
 * park would resurrect an exhausted key on the next boot. The state lives in
 * one plugin-owned JSON document beside the credentials store (same harness
 * home), written through atomic whole-file replacement at owner-only
 * permission bits; it holds key labels and timestamps only, never key values.
 *
 * The document is validated on every read: a missing file is the empty state,
 * and anything else this build cannot prove it understands fails loud with the
 * path named, because silently ignoring a state file would resurrect exactly
 * the exhausted keys persistence exists to keep parked.
 *
 * @module @deepseek-ai/dsh-llm-key-rotation/park-store
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Basename of the park-state document inside the harness home. */
export const PARK_STATE_FILENAME = '.llm-key-rotation-parks.json'

/** Document layout version this build reads and writes. */
export const PARK_STATE_VERSION = 1

/** Permission bits outside the owner; a park document carries none of them. */
const OWNER_ONLY_MODE = 0o600

/** One persisted park: which pool member is out of service until when. */
export interface ParkRecord {
  /** Provider route the member belongs to. */
  readonly route: string
  /** Member label, unique within its route's configuration. */
  readonly label: string
  /** When the member was parked, epoch milliseconds. */
  readonly parkedAt: number
  /** When the member returns to service, epoch milliseconds. */
  readonly resetAt: number
}

/**
 * Resolve the park-state location from plugin config: an explicit `parkFile`
 * wins, otherwise the document lives beside `.credentials.yaml` under the
 * harness home.
 * @param config - the park-location config fields.
 * @returns the absolute document path.
 */
export function resolveParkSpec(config: { parkFile?: string; dshHome?: string }): { filename: string } {
  return {
    filename: resolve(config.parkFile ?? join(resolveDshHome(config.dshHome), PARK_STATE_FILENAME)),
  }
}

/** Whether a filesystem error means absence; every other failure surfaces. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Admit one park row: non-empty strings over finite non-negative epoch numbers. */
function parseParkRow(row: unknown, filename: string, position: number): ParkRecord {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new TypeError(`llm-key-rotation: parks[${position}] in ${filename} must be a mapping`)
  }
  const entry = row as Record<string, unknown>
  for (const field of ['route', 'label'] as const) {
    const value = entry[field]
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`llm-key-rotation: parks[${position}].${field} in ${filename} must be a non-empty string`)
    }
  }
  for (const field of ['parkedAt', 'resetAt'] as const) {
    const value = entry[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`llm-key-rotation: parks[${position}].${field} in ${filename} must be a finite non-negative epoch ms number`)
    }
  }
  return {
    route: entry['route'] as string,
    label: entry['label'] as string,
    parkedAt: entry['parkedAt'] as number,
    resetAt: entry['resetAt'] as number,
  }
}

/**
 * Parse a park-state document body into its rows. Unknown top-level keys, a
 * wrong version, malformed rows, and duplicate route+label pairs all fail
 * loud: a document this build cannot prove it understands never silently
 * degrades to "no parks".
 * @param text - the document's text.
 * @param filename - the document's path, named in every failure.
 * @returns the persisted park records in document order.
 */
export function parseParkState(text: string, filename: string): readonly ParkRecord[] {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (error) {
    throw new Error(`llm-key-rotation: ${filename} is not valid JSON: ${(error as Error).message}`)
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new TypeError(`llm-key-rotation: ${filename} must be a mapping`)
  }
  const fields = root as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    if (key !== 'version' && key !== 'parks') {
      throw new Error(`llm-key-rotation: unknown top-level key "${key}" in ${filename}`)
    }
  }
  if (fields['version'] !== PARK_STATE_VERSION) {
    throw new Error(
      `llm-key-rotation: ${filename} declares version ${JSON.stringify(fields['version'])};`
      + ` this build reads version ${PARK_STATE_VERSION}`,
    )
  }
  const rows = fields['parks']
  if (!Array.isArray(rows)) throw new TypeError(`llm-key-rotation: "parks" in ${filename} must be an array`)
  const seen = new Set<string>()
  return rows.map((row, position) => {
    const record = parseParkRow(row, filename, position)
    const id = `${record.route}\u0000${record.label}`
    if (seen.has(id)) {
      throw new Error(`llm-key-rotation: duplicate park for "${record.label}" on route "${record.route}" in ${filename}`)
    }
    seen.add(id)
    return record
  })
}

/**
 * Read the persisted park records. A missing file is the empty state — first
 * boot, or a deployment that never parked anything; any other read failure,
 * like any parse failure, surfaces so a broken state file is fixed rather
 * than ignored.
 * @param filename - absolute path of the document.
 * @returns the persisted park records, empty when the file does not exist.
 */
export async function readParkState(filename: string): Promise<readonly ParkRecord[]> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  return parseParkState(text, filename)
}

/**
 * Render the versioned document for a set of live parks, sorted by route then
 * label so equivalent states render byte-identically and unchanged pools do
 * not rewrite the file.
 * @param records - the parks to persist.
 * @returns the complete document text.
 */
export function renderParkState(records: readonly ParkRecord[]): string {
  const sorted = [...records].sort((left, right) => left.route.localeCompare(right.route) || left.label.localeCompare(right.label))
  return `${JSON.stringify({ version: PARK_STATE_VERSION, parks: sorted }, null, 2)}\n`
}

/**
 * Replace the park-state document with the given live parks in one atomic
 * step. The fresh inode carries owner-only permission bits (subject to the
 * process umask), and parent directories are created private because the
 * document names credential references even though it never holds values.
 * @param filename - absolute path of the document.
 * @param records - the parks to persist.
 */
export async function writeParkState(filename: string, records: readonly ParkRecord[]): Promise<void> {
  await writeFileAtomic(filename, renderParkState(records), { mode: OWNER_ONLY_MODE, dirMode: 0o700 })
}
