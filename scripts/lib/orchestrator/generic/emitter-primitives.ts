/**
 * scripts/lib/orchestrator/generic/emitter-primitives.ts
 *
 * SHARED EMITTER PRIMITIVES (wall-3 generic emitter — Experiment-A scaffold).
 *
 * The per-class emitters (`emitters/<class>.ts`) each carry a private copy of
 * `mod / cc / word / makeSubModule / synthesizeRadSyntax`. The generic emitter
 * needs the SAME primitives to produce structurally-identical DesignJSON. Per
 * GENERIC-EMITTER-PLAN.md §7 Phase 3 ("extract cc/word/mod/makeSubModule/
 * synthesizeRadSyntax into shared emitter-primitives.ts — no duplication"),
 * this file is that shared home. For now ONLY the generic emitter imports it;
 * a later pass can migrate the 30+ per-class emitters onto it (additive, no
 * behaviour change — these are byte-identical to the copies in
 * `emitters/heat-pump-residential.ts` lines 41-147).
 *
 * SCAFFOLD NOTE (2026-06-03): introduced to make the BESS-golden holdout
 * (Experiment A) runnable without touching any of the 35 registered emitters.
 */

export type Radical = string

export interface ModifierCharacter {
  kind: string
  value: string
  unit?: string
}

export interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: Radical | null
  function_radical_secondary: Radical | null
  material_radical_primary: Radical | null
  material_radical_secondary: Radical | null
}

export interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

export interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

export function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

export function cc(
  character_id: string,
  name_human: string,
  fp: Radical | null,
  mp: Radical | null,
  fs: Radical | null = null,
  ms: Radical | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

export function word(
  id: string,
  name_human: string,
  content: ContentCharacter,
  modifiers: ModifierCharacter[],
): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

export function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

export function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return {
    id,
    name_human,
    english_sentence: '',
    rad_syntax: synthesizeRadSyntax(words),
    role_verb,
    topology_clause,
    words,
  }
}
