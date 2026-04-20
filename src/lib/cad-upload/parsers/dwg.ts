/**
 * @file parsers/dwg.ts
 *
 * @description DWG parser STUB. There is no clean, permissively-licensed,
 * server-side pure-JS DWG parser as of 2026-04. The only working candidate
 * (`@mlightcad/libredwg-web`) is GPL-3.0 and bundling it server-side into a
 * closed-source SaaS raises unresolved copyleft questions.
 *
 * Tristan was asked to make a call between three paths:
 *   1. Drop DWG from V1 (tell founders to export DXF)
 *   2. Bundle GPL-3.0 WASM and accept the licensing risk
 *   3. Ship DWG with a parse-failed stub (this file)
 *
 * See CAD-UPLOAD-HANDOVER.md for the full decision matrix.
 *
 * While awaiting a decision the upload route still accepts DWG files and
 * stores them in the private bucket — so nothing is lost. The parse step
 * returns a structured error that surfaces clearly in the UI. When the
 * decision lands, swap this function's body for a real parser and the rest
 * of the pipeline keeps working unchanged.
 */

import type { ParseResult } from "./index"

// Silence the unused-parameter lint while the stub is in place — the param
// is part of the public signature all other parsers share.
export async function parseDwg(buffer: Uint8Array): Promise<ParseResult> {
  // Referencing the buffer so bundlers and typecheckers see it as used.
  void buffer.byteLength

  return {
    ok: false,
    error:
      "DWG parsing is not supported in V1. Please export your drawing as DXF " +
      "or STEP from your CAD tool and upload that instead. DWG parsing is " +
      "blocked on a licensing decision — see CAD-UPLOAD-HANDOVER.md.",
    code: "dwg_unsupported",
  }
}
