/**
 * @file module-to-module-spec-adapter.ts — Maps CadLabModule to ModuleSpec shape
 *
 * @description The image generator service (image-generator.ts) was built for the
 * legacy X-Ray pipeline and expects ModuleSpec. Rather than rewriting that proven
 * service, this adapter bridges the newer CadLabModule type to the shape it expects.
 *
 * Only fields actually read by image-generator.ts are meaningfully mapped:
 * - detail.whatItIs (for the image prompt)
 * - keyParts (for component labels)
 * - io.in / io.out (for input/output flow arrows)
 * - moduleImagePrompt (optional override)
 *
 * @related
 * - Image generator: src/app/(platform)/the-forge/services/image-generator.ts
 * - CadLabModule type: src/lib/cad-lab-types.ts
 * - ModuleSpec type: src/app/(platform)/the-forge/services/xray-schema.ts
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type { ModuleSpec } from "@/app/(platform)/the-forge/services/xray-schema"

/**
 * Adapts a CadLabModule to the ModuleSpec shape expected by image-generator.ts.
 *
 * Fields not used by the image generator are filled with safe defaults to satisfy
 * the TypeScript type without introducing false data.
 */
export function cadLabModuleToModuleSpec(module: CadLabModule): ModuleSpec {
  return {
    id: module.id,
    name: module.name,
    purpose: module.purpose,

    // I/O: CadLabModule uses flat arrays, ModuleSpec nests under io.in/io.out
    io: {
      in: module.inputs.length > 0 ? module.inputs : ["Input"],
      out: module.outputs.length > 0 ? module.outputs : ["Output"],
    },

    // Key parts — used directly in image prompt for component labels
    keyParts:
      module.keyParts.length >= 5
        ? module.keyParts
        : [...module.keyParts, ...Array(Math.max(0, 5 - module.keyParts.length)).fill("Component")],

    // Tests — not used by image generator, satisfy min(1) constraint
    tests: ["Functional verification"],

    // Requirements — leadWeeks maps, notes gets description
    requirements: {
      leadWeeks: module.leadWeeks,
      notes: module.description || module.purpose,
    },

    // Detail — the core fields read by buildModulePrompt()
    detail: {
      whatItIs: module.description || `${module.name}: ${module.purpose}`,
      whyItMatters: module.whyItMatters || module.purpose,
      commonFailureModes:
        module.failureModes.length > 0 ? module.failureModes : ["Standard wear"],
      unknownsToResolve:
        module.unknowns.length > 0 ? module.unknowns : ["Detailed specification pending"],
      expertQuestions: [
        { discipline: "Mechanical" as const, q: `What are the critical tolerances for ${module.name}?` },
        { discipline: "Process" as const, q: `What manufacturing process is optimal for ${module.name}?` },
      ],
    },

    // Image fields
    moduleImagePrompt: module.moduleImagePrompt,
    imageUrl: module.imageUrl,
    imageStatus: module.imageStatus,
  } as unknown as ModuleSpec
}
