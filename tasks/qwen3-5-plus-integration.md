# Qwen3.5-plus Integration — Strategy & Implementation

## What Changed

Alibaba open-sourced **Qwen3.5-plus**, a Hybrid Sparse MoE model with 397B total parameters but only 17B active at inference. It delivers frontier-class performance (MMLU-Pro: 87.8, GPQA: 88.4) rivaling GPT-5.2 and Gemini-3-Pro, at dramatically lower cost.

Key technical differentiators:
- **Multi-Token Prediction** — up to 8× faster inference
- **Linear Attention + Sparse MoE** — near-instant long-context responses
- **Native multimodal coding** — generates production-ready frontend components
- **201 languages** — genuine global coverage
- **Apache 2.0** — no API restrictions, full open-source

## How We Integrated It

### Architecture: Zero-Migration Pattern

Qwen models expose an **OpenAI-compatible API** via Alibaba's DashScope service at `https://dashscope.aliyuncs.com/compatible-mode/v1`. We used the exact same integration pattern as MiniMax — OpenAI SDK with a custom `baseURL`:

```typescript
const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
})
```

This means:
- No new SDK dependency
- Battle-tested streaming via the OpenAI SDK
- Consistent error handling across all providers
- Immediate compatibility with all existing agent features

### Files Modified

| File | Change |
|------|--------|
| `src/lib/ai-providers/types.ts` | Added `"qwen"` to `AI_PROVIDERS`, registered 4 models |
| `src/lib/ai-providers/registry.ts` | Added `streamQwen()` text streaming provider |
| `src/app/api/agents/execute/route.ts` | Added `DASHSCOPE_API_KEY` to env map |
| `src/lib/telegram/specialist-chat.ts` | Added Qwen to Telegram bot's provider map |
| `src/app/(platform)/agents/specialists-data.ts` | Added `"qwen"` model tier, reassigned 3 specialists |
| `src/app/(platform)/agents/brief-specialist-dialog.tsx` | Added `"qwen"` to `MODEL_TIERS` |
| `src/components/settings/ai-providers.tsx` | Added `Flame` icon for Qwen provider |
| `.env.example` | Added `DASHSCOPE_API_KEY` configuration |

### Model Tier Strategy

ForgeOS now has three model tiers for specialist agents:

| Tier | Provider | Model | Use Case | Cost |
|------|----------|-------|----------|------|
| `claude` | Anthropic | Claude Opus 4.6 | High-stakes reasoning (strategy, finance, legal) | $$$ |
| `qwen` | Alibaba | Qwen3.5-plus | Technical + coding specialists (CTO, engineering, product) | $ |
| `minimax` | MiniMax | M2.5 | High-volume conversational (marketing, sales, HR) | $ |

### Specialist Assignments

Moved to `qwen` tier:
- **Max (CTO)** — Qwen3.5-plus excels at agentic coding and architecture reasoning
- **Jian (VP Engineering)** — Sprint planning, technical execution, code quality
- **Priya (Product Lead)** — Product thinking, requirements, acceptance criteria

Kept on `claude`:
- **Sage (Strategy)** — Highest-stakes strategic reasoning
- **Finn (Finance)** — Financial modeling requires precision
- **Cal (Chief of Staff)** — Cross-functional coordination
- **Leo (Legal)** — Legal analysis demands extreme accuracy

Kept on `minimax`:
- **Mia (Marketing)** — High-volume content generation
- **Sal (Sales)** — Conversational, scripts, outreach
- **Fang (VP Manufacturing)** — Production processes
- **Chase (VP Supply Chain)** — Supply logistics
- **Fiona (Fundraising)** — Pitch prep, investor materials
- **Harper (People)** — HR, hiring, team culture

## Setup Instructions

### 1. Get a DashScope API Key

1. Visit [DashScope Console](https://dashscope.console.aliyun.com/apiKey)
2. Sign up for an Alibaba Cloud account (free tier available)
3. Generate an API key

### 2. Configure Environment

Add to `.env.local`:
```bash
DASHSCOPE_API_KEY=sk-your-key-here
```

### 3. BYOK (Bring Your Own Key)

Users can also add their own DashScope key via:
**Settings → AI Providers → Qwen (Alibaba) → Add API Key**

### Available Models

| Model | Best For | Context | Speed |
|-------|----------|---------|-------|
| `qwen3.5-plus` | Frontier reasoning + coding | 131K tokens | Fast (MTP) |
| `qwen3-235b-a22b` | Deep thinking tasks | 131K tokens | Medium |
| `qwen3-32b` | Cost-effective reasoning | 131K tokens | Fast |
| `qwen-turbo-latest` | Speed-critical tasks | 131K tokens | Fastest |

## Future Opportunities

### Self-Hosted Deployment
Since Qwen3.5-plus is Apache 2.0, we could:
1. Deploy on our own GPU infrastructure (Modal, RunPod, etc.)
2. Eliminate per-token API costs entirely
3. Add custom fine-tuning for ForgeOS-specific tasks
4. Guarantee data privacy (no external API calls)

### Multimodal Expansion
Qwen's multimodal capabilities could enable:
- Image understanding in product analysis
- Document parsing for legal/financial specialists
- Code screenshot analysis for CTO specialist

### Thinking Mode
Qwen3.5-plus supports `enable_thinking` for extended chain-of-thought reasoning (similar to Anthropic's extended thinking). Already wired up in `streamQwen()` — can be enabled per-specialist when deep reasoning is needed.

## Cost Impact

Estimated savings from moving 3 specialists (CTO, VP Eng, Product) from Claude to Qwen:
- Claude Opus 4.6: ~$15/M input, ~$75/M output tokens
- Qwen3.5-plus via DashScope: ~$0.80/M input, ~$2.40/M output tokens
- **~90% cost reduction** for these specialists with comparable quality

At scale (1000 active foundries), this could save $5,000-15,000/month.
