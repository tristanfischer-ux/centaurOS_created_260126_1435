/**
 * @file replication-scope.ts
 * @description Universal role→replication-axis binding for structural words.
 *
 * INTENT (Sol+Fable 2026-07-27, P1): Multiplicity was driven by the LLM's
 * naming whim (`Per Channel …` / `per_channel_*` → ×8; bare "Charge Current
 * Source" → ×1) while `channel_count=8` sat on the ledger. A channel-replicated
 * ROLE must bind `<scope>_count` regardless of the surface name.
 *
 * DECISION: Only bind the `channel_count` axis via role (never `cell_count`).
 * Powerwall "Cell Temperature Sensor" stays ×1 under unqualified cell_count
 * because this module never looks up cell_count. Shared bus/MCU/inlet roles
 * are explicitly excluded.
 *
 * UNIVERSAL — noun/role regex, no product-class table.
 */

/** Shared / aggregate nouns that must NEVER take channel_count via role. */
const SHARED_CHANNEL_AXIS_RE =
  /\b(bus|backplane|manifold|aggregate|shared|enclosure|chassis|bay|inlet|outlet|psu|supply|mains|display|touch|ethernet|usb|mcu|microcontroller|controller_board|main_controller|fan_assembly|heatsink_fan_assembly|power[_\s-]?cooling[_\s-]?fan|cooling[_\s-]?fan)\b/i

/**
 * Roles that are intrinsically one-per-channel electrical/sense/safety work
 * when a multi-channel axis exists on the ledger. Matched against id + human
 * name (normalised). Prefix `per_channel_` is sufficient but NOT required.
 *
 * GOTCHA (cold-v14): `power_cooling_fan` is SHARED airflow (one plenum / fan
 * bank for the aggregate dissipation), NOT one axial fan per channel. Leaving
 * it channel-replicated minted 8× ebm-papst 4414FNH (~£480) against a 200 W
 * instrument budget. Heatsinks stay per-channel; fans do not.
 */
const CHANNEL_REPLICATED_ROLE_RE =
  /\b(charge[_\s-]?current[_\s-]?source|discharge[_\s-]?(load[_\s-]?)?mosfet|current[_\s-]?shunt|cell[_\s-]?thermistor|thermistor[_\s-]?input|over[_\s-]?under[_\s-]?voltage|overcurrent[_\s-]?comparator|overtemp[_\s-]?trip|reverse[_\s-]?polarity|linear[_\s-]?(source[_\s-]?)?sink|precision[_\s-]?afe|\bafe\b|kelvin[_\s-]?(voltage[_\s-]?)?sense|hardware[_\s-]?cutout|power[_\s-]?heatsink|source[_\s-]?sink[_\s-]?stage|discharge[_\s-]?pass[_\s-]?bank|current[_\s-]?control[_\s-]?loop|cell[_\s-]?holder(?:[_\s-]?fixture)?)\b/i

function normalizeRoleText(idOrName: string): string {
  return String(idOrName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * @description True when the word is a shared axis (bus / MCU / inlet / …)
 * that must stay ×1 even if it mentions "channel".
 */
export function isSharedChannelAxisRole(idOrName: string): boolean {
  const t = normalizeRoleText(idOrName)
  if (!t) return false
  // "channel_power_bus" / "Channel Power Bus"
  if (/channel_.{0,24}(bus|backplane|manifold)/.test(t)) return true
  if (SHARED_CHANNEL_AXIS_RE.test(t.replace(/_/g, ' '))) return true
  return false
}

/**
 * @description True when the word's ROLE is one-per-channel work (power path,
 * sense, or independent trip), regardless of `per_channel_` naming.
 */
export function isChannelReplicatedRole(idOrName: string): boolean {
  if (isSharedChannelAxisRole(idOrName)) return false
  const t = normalizeRoleText(idOrName)
  if (!t) return false
  // GOTCHA: legacy `per_channel_power_cooling_fan` / human "Per Channel … Fan"
  // must stay SHARED even with the prefix — airflow is a plenum, not a
  // per-channel purchasable (cold-v14 ×8 fan disease).
  if (/cooling_fan|fan_assembly|heatsink_fan/.test(t)) return false
  if (/^per_channel_/.test(t)) return true
  // Human "Per Channel …" already normalised to per_channel_…
  return CHANNEL_REPLICATED_ROLE_RE.test(t.replace(/_/g, ' '))
    || CHANNEL_REPLICATED_ROLE_RE.test(t)
}

/**
 * @description Explicit `per_<scope>_` marker → scope name, else null.
 */
export function explicitPerScope(idOrName: string): { scope: string } | null {
  const id = normalizeRoleText(idOrName)
  const m = id.match(/^per_([a-z0-9]+)_(.+)$/)
  if (m) return { scope: m[1] }
  const human = String(idOrName ?? '').match(/^Per\s+([A-Za-z0-9]+)\s+/i)
  if (human) return { scope: human[1].toLowerCase() }
  return null
}

/**
 * @description Replication count implied by ROLE against the contract ledger.
 * Returns null when the word is not role-bound (caller falls through to
 * head-noun / qualifier matching). Never returns cell_count.
 *
 * @param idOrName - word id or human name
 * @param quantities - contract quantity map
 */
export function roleReplicationCount(
  idOrName: string,
  quantities: Record<string, { value?: unknown } | undefined> | null | undefined,
): number | null {
  const q = quantities ?? {}
  // INTENT (cold-v14): shared airflow / bus / MCU never bind channel_count —
  // including the legacy mis-prefixed `per_channel_power_cooling_fan`.
  if (isSharedChannelAxisRole(idOrName)) return null
  const t = normalizeRoleText(idOrName)
  if (/cooling_fan|fan_assembly|heatsink_fan/.test(t)) return null

  const explicit = explicitPerScope(idOrName)
  if (explicit) {
    for (const suffix of ['count', 'qty', 'quantity', 'number'] as const) {
      const key = `${explicit.scope}_${suffix}`
      const v = Number(q[key]?.value)
      if (Number.isFinite(v) && v >= 1 && v < 1e7) return Math.round(v)
    }
  }
  if (!isChannelReplicatedRole(idOrName)) return null
  const v = Number(q.channel_count?.value)
  if (Number.isFinite(v) && v >= 2 && v < 1e7) return Math.round(v)
  return null
}
