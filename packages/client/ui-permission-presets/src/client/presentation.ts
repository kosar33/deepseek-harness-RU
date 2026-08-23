/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(value: string, name: string): string {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

/** Locale keys for the three conventional presets, keyed by machine value. */
export const PRESET_MODE_KEYS = {
  'read-only': 'mode.read-only',
  'workspace-write': 'mode.workspace-write',
  [FULL_ACCESS_PRESET]: 'mode.full-access',
} as const

/**
 * Localized label for a preset when it is one of the three conventional
 * values; `undefined` for host-configured names, which keep their authored
 * label or the title-cased machine name.
 * @param value - preset machine value.
 * @returns the locale key for a conventional preset, else undefined.
 */
export function presetModeKey(value: string): 'mode.read-only' | 'mode.workspace-write' | 'mode.full-access' | undefined {
  return (PRESET_MODE_KEYS as Record<string, 'mode.read-only' | 'mode.workspace-write' | 'mode.full-access'>)[value]
}
