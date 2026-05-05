import { StageResult } from '../types';
import { sanitiseLlmOutput } from '../sanitiser';

const STAGE_0_MODELS = [
    { id: "x-ai/grok-4.3", name: "Grok 4.3", lineage: "xai" },
    { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", lineage: "anthropic" },
    { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", lineage: "google" },
];

const BATCH_TIMEOUT_MS = 300000;

export async function runTrainingDataDump(
    productDescription: string,
    designBriefContext: string = ""
): Promise<StageResult<{ dossier: string; modelCount: number; totalChars: number }>> {
    const start = Date.now();

    const systemPrompt = `You are a senior hardware product development expert with deep domain knowledge across engineering, manufacturing, supply chains, regulatory compliance, market dynamics, and cost estimation.

Based ONLY on your training data (no web search, no external tools), provide a comprehensive knowledge dump about the product described below. This information will be used to GROUND the entire development pipeline — from initial research through to bill of materials and cost estimation.

Structure your response in these sections (answer ALL sections, write "UNKNOWN" if you genuinely don't have data):

### 1. ENGINEERING SPECIFICATIONS
What are the typical/known specifications for this type of product?
- Dimensions (length × width × height), weight, capacity
- Power rating, voltage, current specifications
- Key materials and construction methods
- Performance parameters and operating ranges
- If you know exact numbers, provide them. If you know ranges, provide ranges.

### 2. COMPETITOR PRODUCTS
What companies make similar products? For each:
- Company name, product name, key differentiators
- Approximate price tier or cost range
- Notable features or specifications
- Geographic markets they serve
List at least 3 if you know any.

### 3. REGULATORY REQUIREMENTS
What certifications, standards, and regulations apply?
- Safety standards (UL, IEC, BS, etc.)
- Environmental regulations (RoHS, REACH, WEEE, etc.)
- Transport/delivery regulations
- Industry-specific certifications
- Geographic jurisdiction (UK, EU, North America, Asia)

### 4. MARKET DATA
What do you know about this market?
- Market size (TAM/SAM) if known
- Growth rate and trends
- Key customer segments
- Geographic demand patterns
- Industry reports or benchmarks

### 5. SUPPLIERS AND MANUFACTURERS
What companies supply components or manufacture this type of product?
- Company names, locations, specialties
- Manufacturing clusters or geographic concentrations
- Known supply chain patterns

### 6. COST BENCHMARKS
What are typical cost structures for this product category?
- Bill of materials breakdown percentages
- Known component costs (if any)
- Manufacturing cost ranges
- Margin expectations

### 7. MATERIALS AND CERTIFICATIONS
What materials are typically used? What certifications do buyers require?
- Primary and secondary materials
- Surface finishes, coatings
- Certification requirements by market

### 8. APPLICATION-SPECIFIC KNOWLEDGE
Any domain-specific knowledge about how this product is used, deployed, or maintained?
- Installation requirements
- Maintenance patterns
- Integration with other systems
- Common failure modes

Be specific with numbers where your training data supports it. Write "UNKNOWN" rather than guessing. Label your confidence: [HIGH], [MEDIUM], or [LOW] for each factual claim.`;

    const userPrompt = [
        `PRODUCT DESCRIPTION:\n${productDescription}`,
        designBriefContext ? `\nADDITIONAL CONTEXT FROM FOUNDER:\n${designBriefContext}` : "",
    ].filter(Boolean).join("\n");

    console.info(`[stage-0] Starting parallel execution with ${STAGE_0_MODELS.length} models...`);

    const partialResults: Array<{ model: string; lineage: string; output: string }> = [];

    const batchPromise = Promise.all(
        STAGE_0_MODELS.map(async (model) => {
            const modelStart = Date.now();
            const controller = new AbortController();
            let timeoutId: NodeJS.Timeout;
            
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`Timeout after ${BATCH_TIMEOUT_MS}ms`));
                }, BATCH_TIMEOUT_MS);
            });

            try {
                console.info(`[stage-0] Calling ${model.name}...`);
                const fetchPromise = fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: model.id,
                        max_tokens: 14000,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt }
                        ]
                    }),
                    signal: controller.signal
                }).then(async (res) => {
                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(`HTTP ${res.status}: ${errorText}`);
                    }
                    const data = await res.json();
                    const msg = data.choices?.[0]?.message;
                    if (!msg) return "";
                    
                    const content = msg.content || "";
                    const reasoning = msg.reasoning_content || "";
                    return (reasoning ? reasoning + "\n\n" : "") + content;
                });

                const rawOutput = await Promise.race([fetchPromise, timeoutPromise]);
                clearTimeout(timeoutId!);
                
                const output = sanitiseLlmOutput(rawOutput.trim());
                const elapsed = Date.now() - modelStart;
                
                console.info(
                    `[stage-0] Model ${model.name} completed: ${output.length} chars in ${elapsed}ms`
                );
                
                if (output && output.length > 100) {
                    partialResults.push({ model: model.name, lineage: model.lineage, output });
                }
            } catch (err) {
                clearTimeout(timeoutId!);
                const elapsed = Date.now() - modelStart;
                const errMsg = err instanceof Error ? err.message : String(err);
                console.warn(`[stage-0] ${model.name} (${model.lineage}) FAILED after ${elapsed}ms: ${errMsg}`);
            }
        })
    );

    await batchPromise;

    const successfulOutputs = partialResults;
    const seenHashes = new Set<string>();

    const dossierParts: string[] = [
        `=== STAGE 0: TRAINING DATA KNOWLEDGE DUMP ===`,
        `Models consulted: ${STAGE_0_MODELS.length}`,
        `Models responded: ${successfulOutputs.length}`,
        `This dossier contains what ${successfulOutputs.length} LLMs know from their training data.`,
        `Use this to ground each pipeline stage — it supplements (does not replace) web research.`,
        "",
    ];

    for (const output of successfulOutputs) {
        const paragraphs = output.output.split(/\n\s*\n/);
        const uniqueParagraphs: string[] = [];

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;
            
            if (trimmed.length < 100 || trimmed.startsWith("###") || trimmed.startsWith("---")) {
                uniqueParagraphs.push(trimmed);
                continue;
            }

            const hash = trimmed.slice(0, 100).toLowerCase();
            if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                uniqueParagraphs.push(trimmed);
            }
        }

        const deduplicatedOutput = uniqueParagraphs.join("\n\n");

        dossierParts.push(
            `--- ${output.model} (${output.lineage}) ---`,
            deduplicatedOutput.slice(0, 6000),
            "",
        );
    }

    const dossier = dossierParts.join("\n");
    const totalChars = dossier.length;
    const elapsedMs = Date.now() - start;

    console.info(
        `[stage-0] COMPLETE: ${successfulOutputs.length} models responded, ` +
        `${totalChars} chars total, ${elapsedMs}ms`
    );

    return {
        ok: successfulOutputs.length > 0,
        error: successfulOutputs.length === 0 ? "All models failed to return training data." : undefined,
        data: {
            dossier,
            modelCount: successfulOutputs.length,
            totalChars
        },
        durationMs: elapsedMs
    } as any
}
