/**
 * @file openai-lazy.ts
 *
 * @description Lazy-loaded OpenAI client singleton. Avoids repeated dynamic
 * imports across sweep-orchestrator, sweep-synthesis, and agentic-actions.
 *
 * @example
 * const OpenAI = await getOpenAIClient()
 * const client = new OpenAI({ apiKey, baseURL })
 */

type OpenAIModule = Awaited<typeof import('openai')>
type OpenAIConstructor = OpenAIModule['default']

let _OpenAI: OpenAIConstructor | null = null

/**
 * Returns the OpenAI SDK constructor. Loaded once, cached thereafter.
 */
export async function getOpenAIClient(): Promise<OpenAIConstructor> {
  if (!_OpenAI) {
    const mod = await import('openai')
    _OpenAI = mod.default
  }
  return _OpenAI
}
