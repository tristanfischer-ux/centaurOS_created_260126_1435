/**
 * @file PCB toolchain discovery — ENGINE-SIDE (Phase A, 2026-07-12).
 * @description Detects the installed KiCad/Atopile/Freerouting toolchain without
 * relying on PATH alone. Ported verbatim from `prototypes/pcb-capability/discover-pcb-capability.ts`
 * (validated live 2026-07-12: kicad-cli 10.0.4, atopile 0.2.69, Freerouting 2.2.4, 222 KiCad
 * symbol libs, 15,435 footprints) into the engine so the chain's shadow PCB stage
 * (`pcb-stage.ts`) can call it directly. Pure/side-effect-free except the fs/exec probes
 * a capability-discovery module inherently requires — no writes, no state mutation.
 *
 * Run standalone: npx tsx src/lib/pdf-engine-v2/lib/pcb/discover-capability.ts
 */

import { execFileSync, spawnSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { delimiter, resolve } from 'path'

export interface ExecutableCapability {
  available: boolean
  path?: string
  version?: string
  error?: string
}

export interface LibraryCapability {
  available: boolean
  path: string
  itemCount: number
}

export interface PcbCapabilityManifest {
  kicadCli: ExecutableCapability
  atopile: ExecutableCapability
  freerouting: ExecutableCapability
  java: ExecutableCapability
  kicadSymbols: LibraryCapability
  kicadFootprints: LibraryCapability
  canAuthor: boolean
  canRoute: boolean
  canVerifyAndExport: boolean
  missingRequired: string[]
}

function pathCandidates(name: string): string[] {
  return String(process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => resolve(directory, name))
}

function firstExisting(candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate))
}

function inspectExecutable(
  candidates: readonly string[],
  versionArgs: readonly string[],
): ExecutableCapability {
  const executable = firstExisting(candidates)
  if (!executable) return { available: false, error: 'not_found' }
  try {
    const version = execFileSync(executable, [...versionArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim()
    return { available: true, path: executable, version }
  } catch (error) {
    return {
      available: false,
      path: executable,
      error: error instanceof Error ? error.message : 'version_probe_failed',
    }
  }
}

function inspectExecutablePresence(
  candidates: readonly string[],
): ExecutableCapability {
  const executable = firstExisting(candidates)
  return executable
    ? { available: true, path: executable }
    : { available: false, error: 'not_found' }
}

function inspectJava(candidates: readonly string[]): ExecutableCapability {
  const executable = firstExisting(candidates)
  if (!executable) return { available: false, error: 'not_found' }
  const result = spawnSync(executable, ['-version'], {
    encoding: 'utf8',
    timeout: 10_000,
  })
  const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  if (
    result.status === 0 &&
    !/unable to locate a java runtime/i.test(detail)
  ) {
    return { available: true, path: executable, version: detail }
  }
  return {
    available: false,
    path: executable,
    error: detail || result.error?.message || `exit_${result.status}`,
  }
}

function inspectLibrary(path: string, suffix: string): LibraryCapability {
  if (!existsSync(path)) return { available: false, path, itemCount: 0 }
  const itemCount = readdirSync(path, { recursive: true })
    .filter((entry) => String(entry).endsWith(suffix))
    .length
  return { available: itemCount > 0, path, itemCount }
}

/**
 * @description Discovers a usable local PCB design toolchain.
 * @returns Paths, versions, libraries, and derived capability flags.
 */
export function discoverPcbCapability(): PcbCapabilityManifest {
  const kicadRoot = '/Applications/KiCad/KiCad.app/Contents'
  const kicadCli = inspectExecutable(
    [
      process.env.KICAD_CLI ?? '',
      ...pathCandidates('kicad-cli'),
      resolve(kicadRoot, 'MacOS/kicad-cli'),
    ].filter(Boolean),
    ['--version'],
  )
  const atopile = inspectExecutable(
    [
      process.env.ATO_BIN ?? '',
      ...pathCandidates('ato'),
      resolve(process.env.HOME ?? '', '.local/bin/ato'),
    ].filter(Boolean),
    ['--version'],
  )
  // GOTCHA: the macOS Freerouting app does not implement a cheap `--version`;
  // invoking it launches the GUI and times out. Presence is the correct boot signal.
  const freerouting = inspectExecutablePresence(
    [
      process.env.FREEROUTING_BIN ?? '',
      ...pathCandidates('freerouting'),
      '/Applications/freerouting.app/Contents/MacOS/freerouting',
    ].filter(Boolean),
  )
  const java = inspectJava(
    [
      process.env.JAVA_BIN ?? '',
      '/opt/homebrew/opt/openjdk/bin/java',
      ...pathCandidates('java'),
    ].filter(Boolean),
  )
  const kicadSymbols = inspectLibrary(
    resolve(kicadRoot, 'SharedSupport/symbols'),
    '.kicad_sym',
  )
  const kicadFootprints = inspectLibrary(
    resolve(kicadRoot, 'SharedSupport/footprints'),
    '.kicad_mod',
  )

  const canAuthor =
    atopile.available &&
    kicadCli.available &&
    kicadSymbols.available &&
    kicadFootprints.available
  const canRoute =
    canAuthor && (freerouting.available || java.available)
  const canVerifyAndExport = kicadCli.available
  const missingRequired = [
    ...(!kicadCli.available ? ['kicad-cli'] : []),
    ...(!atopile.available ? ['atopile'] : []),
    ...(!kicadSymbols.available ? ['kicad-symbol-library'] : []),
    ...(!kicadFootprints.available ? ['kicad-footprint-library'] : []),
  ]

  return {
    kicadCli,
    atopile,
    freerouting,
    java,
    kicadSymbols,
    kicadFootprints,
    canAuthor,
    canRoute,
    canVerifyAndExport,
    missingRequired,
  }
}

if (require.main === module) {
  console.log(JSON.stringify(discoverPcbCapability(), null, 2))
}
