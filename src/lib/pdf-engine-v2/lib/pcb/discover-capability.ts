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
import { existsSync, readdirSync, realpathSync, statSync } from 'fs'
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

/**
 * @description The KiCad-bundled Python interpreter + site-packages containing
 * `pcbnew` — the only way to call `LoadBoard`/`ExportSpecctraDSN`/`ImportSpecctraSES`
 * (kicad-cli exposes no equivalent subcommands as of KiCad 10.0.4, verified
 * 2026-07-12). Discovered generically by resolving the `Versions/Current` symlink
 * under KiCad.app's bundled Python.framework — never a hardcoded version number
 * (KiCad has shipped 3.9 through several release lines; hardcoding it breaks on
 * the next KiCad upgrade).
 */
export interface PythonBridgeCapability {
  available: boolean
  pythonBin?: string
  sitePackages?: string
  error?: string
}

export interface PcbCapabilityManifest {
  kicadCli: ExecutableCapability
  atopile: ExecutableCapability
  freerouting: ExecutableCapability
  java: ExecutableCapability
  kicadSymbols: LibraryCapability
  kicadFootprints: LibraryCapability
  /** Path to the Freerouting autorouter .jar, discovered from the freerouting.app
   *  bundle's own `Contents/app/*.jar` (or `$FREEROUTING_JAR`) — never `/tmp`. */
  freeroutingJar: ExecutableCapability
  kicadPythonBridge: PythonBridgeCapability
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

function isTransientProbeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  // INTENT (NinjaPCR 2302): kicad-cli --version ETIMEDOUT under concurrent
  // Blender/chain load flipped canAuthor=false on a host where the binary is
  // fine (colorimeter 2254 canAuthor=true minutes earlier). Retry transient
  // spawn failures; permanent missing/crash still fails closed.
  return /ETIMEDOUT|EAGAIN|EBUSY|timed?\s*out/i.test(message)
}

function inspectExecutable(
  candidates: readonly string[],
  versionArgs: readonly string[],
): ExecutableCapability {
  const executable = firstExisting(candidates)
  if (!executable) return { available: false, error: 'not_found' }
  // DECISION: 25s × 3 beats a false canAuthor=false that skips the whole PCB
  // pipeline (exit-floor 0). Cold kicad-cli --version is ~0.2s; the long budget
  // is only for contended hosts.
  const timeoutsMs = [25_000, 40_000, 60_000] as const
  let lastError = 'version_probe_failed'
  for (let attempt = 0; attempt < timeoutsMs.length; attempt += 1) {
    try {
      const version = execFileSync(executable, [...versionArgs], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutsMs[attempt],
      }).trim()
      return { available: true, path: executable, version }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'version_probe_failed'
      if (!isTransientProbeError(error) || attempt === timeoutsMs.length - 1) {
        break
      }
      // No sleep helper needed: each retry widens the exec timeout so a
      // contended kicad-cli can finish under the next budget.
    }
  }
  // INTENT (Poseidon 2324 / NinjaPCR 2302): under dual-Blender CPU saturation,
  // execFileSync still ETIMEDOUT at 60s even though `kicad-cli --version` is
  // ~0.2s when idle. Final fallback: spawnSync with a 90s budget — if that also
  // flakes but the binary is present + executable, accept presence (version
  // unknown) so canAuthor is not a false negative that floors PCB at 0.
  if (isTransientProbeError({ message: lastError })) {
    const spawned = spawnSync(executable, [...versionArgs], {
      encoding: 'utf8',
      timeout: 90_000,
    })
    const detail = `${spawned.stdout ?? ''}\n${spawned.stderr ?? ''}`.trim()
    if (spawned.status === 0 && detail) {
      return { available: true, path: executable, version: detail.split('\n')[0] }
    }
    try {
      // Safe assertion: we already resolved an on-disk executable path above.
      const mode = statSync(executable).mode
      if ((mode & 0o111) !== 0) {
        return {
          available: true,
          path: executable,
          version: 'presence_after_timeout',
        }
      }
    } catch {
      // fall through to unavailable
    }
  }
  return {
    available: false,
    path: executable,
    error: lastError,
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
 * @description Finds the Freerouting .jar generically: the app bundle's own
 * `Contents/app/` directory is globbed for any `*.jar` (never a hardcoded
 * filename — Freerouting's jar name has changed across releases, e.g.
 * `freerouting-executable.jar`). `$FREEROUTING_JAR` always wins if set.
 */
function inspectFreeroutingJar(freeroutingBinPath: string | undefined): ExecutableCapability {
  const envJar = process.env.FREEROUTING_JAR
  if (envJar && existsSync(envJar)) return { available: true, path: envJar }
  if (!freeroutingBinPath) return { available: false, error: 'freerouting_binary_not_found' }
  // freeroutingBinPath is typically .../Contents/MacOS/freerouting; the jar
  // ships alongside at .../Contents/app/*.jar in the same bundle.
  const contentsDir = resolve(freeroutingBinPath, '..', '..')
  const appDir = resolve(contentsDir, 'app')
  if (!existsSync(appDir)) return { available: false, error: 'app_dir_not_found' }
  const jar = readdirSync(appDir).find((entry) => entry.endsWith('.jar'))
  if (!jar) return { available: false, error: 'no_jar_in_app_dir' }
  return { available: true, path: resolve(appDir, jar) }
}

/**
 * @description Resolves KiCad's bundled Python interpreter + pcbnew site-packages
 * via the `Python.framework/Versions/Current` symlink (never a hardcoded version).
 */
function inspectKicadPythonBridge(kicadRoot: string): PythonBridgeCapability {
  const versionsDir = resolve(kicadRoot, 'Frameworks/Python.framework/Versions')
  if (!existsSync(versionsDir)) return { available: false, error: 'python_framework_not_found' }
  let versionDir: string
  try {
    versionDir = realpathSync(resolve(versionsDir, 'Current'))
  } catch {
    return { available: false, error: 'current_symlink_unresolvable' }
  }
  const pythonBin = resolve(versionDir, 'bin/python3')
  if (!existsSync(pythonBin)) return { available: false, error: 'python3_binary_not_found' }
  const libDir = resolve(versionDir, 'lib')
  const pyVersionDirName = existsSync(libDir)
    ? readdirSync(libDir).find((entry) => entry.startsWith('python'))
    : undefined
  if (!pyVersionDirName) return { available: false, pythonBin, error: 'site_packages_dir_not_found' }
  const sitePackages = resolve(libDir, pyVersionDirName, 'site-packages')
  const pcbnewPresent = existsSync(resolve(sitePackages, 'pcbnew.py')) || existsSync(sitePackages)
  return pcbnewPresent
    ? { available: true, pythonBin, sitePackages }
    : { available: false, pythonBin, error: 'site_packages_not_found' }
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
  const freeroutingJar = inspectFreeroutingJar(freerouting.path)
  const kicadPythonBridge = inspectKicadPythonBridge(kicadRoot)

  const canAuthor =
    atopile.available &&
    kicadCli.available &&
    kicadSymbols.available &&
    kicadFootprints.available
  const canRoute =
    canAuthor && freeroutingJar.available && java.available && kicadPythonBridge.available
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
    freeroutingJar,
    kicadPythonBridge,
    canAuthor,
    canRoute,
    canVerifyAndExport,
    missingRequired,
  }
}

if (require.main === module) {
  console.log(JSON.stringify(discoverPcbCapability(), null, 2))
}
