# Voicebox Integration: Strategic Recommendation

## TL;DR

**Deploy Voicebox as a self-hosted TTS backend behind the existing `/api/agents/tts` route, giving each of the 13 specialists a unique cloned voice.** This is the single highest-leverage integration because it transforms every voice interaction in the product — calls, briefings, TTS playback — from "talking to a stock AI" into "talking to a person I know." It works through every existing voice path (half-duplex engine, realtime engine, chunked TTS, specialist chat) without changing any of them.

Do **not** build Founder Voice Clone, audio podcasts, or a voice admin panel yet. Those are sequels to the specialist voice work, and the specialist voices alone are enough to justify the integration.

---

## Why This, Why Now

ForgeOS has an unusually deep voice stack for a productivity platform:

- **3 conversation engines** (half-duplex, realtime, PersonaPlex) — all flow through `/api/agents/tts`
- **13 specialists** with backstories, personalities, writing styles, celebration styles, strong opinions, and inter-specialist relationships
- **Billing tiers** that gate voice access (Growth: 2hr/mo, Enterprise: 10hr/mo)
- **Voice session dialog** that presents calls as "calling a colleague"

The product already invests heavily in making specialists feel like real people. But there's one glaring gap: **they all sound like the same 11 OpenAI voices.** Sage (Strategy) uses `echo`. Max (CTO) uses `onyx`. But `echo` and `onyx` are shared by millions of OpenAI users — they carry no identity. You can't recognize "Sage's voice" because Sage doesn't have one.

Voicebox closes this gap. It lets you record or curate a specific voice sample and clone it. Each specialist gets a voice that belongs only to them, across every interaction in ForgeOS.

---

## What Changes (Almost Nothing)

The integration point is a single file: **`/api/agents/tts/route.ts`**.

This route already has a provider switch (`"openai"` / `"minimax"`). We add a third: `"voicebox"`. Every voice path in the product — the `useTts` hook, the half-duplex engine's `speakText()`, the chunked playback, the specialist presentation — calls this one route. Zero downstream changes.

```
┌──────────────────────────────────────────────────────────────┐
│                     Existing Voice Paths                      │
│                     (NO CHANGES NEEDED)                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  useTts().play()          ─┐                                 │
│  useTts().playChunked()   ─┤                                 │
│  HalfDuplexEngine         ─┼──▶  POST /api/agents/tts       │
│  VoiceSessionDialog       ─┤         │                       │
│  SpecialistPresentation   ─┘         ▼                       │
│                              ┌───────────────┐               │
│                              │ Provider Switch│               │
│                              └───────┬───────┘               │
│                         ┌────────────┼────────────┐          │
│                         ▼            ▼            ▼          │
│                      OpenAI      MiniMax     Voicebox        │
│                     (existing)  (existing)   (NEW)           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The specialist data already has a `voice` field on each specialist. We add an optional `voiceboxProfileId` field. The TTS route checks: if Voicebox is configured and the specialist has a profile ID, use the cloned voice. Otherwise fall back to the existing OpenAI/MiniMax voice. Graceful degradation, zero risk.

---

## What We Need to Build

### 1. Voicebox TTS Provider (~1 day)

Add `generateVoiceboxTTS()` to `/api/agents/tts/route.ts`:

```typescript
async function generateVoiceboxTTS(text: string, profileId: string): Promise<ArrayBuffer> {
    const baseUrl = process.env.VOICEBOX_API_URL
    if (!baseUrl) throw new Error("Voicebox not configured")

    const gen = await fetch(`${baseUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, text, language: "en" }),
    })

    if (!gen.ok) throw new Error(`Voicebox generation failed: ${gen.status}`)
    const { id } = await gen.json()

    const audio = await fetch(`${baseUrl}/audio/${id}`)
    if (!audio.ok) throw new Error(`Voicebox audio fetch failed: ${audio.status}`)

    return audio.arrayBuffer()
}
```

Wire it into the existing provider switch with fallback:

```typescript
// In the main POST handler — after validation, before response
if (voiceboxProfileId && process.env.VOICEBOX_API_URL) {
    try {
        audioBuffer = await generateVoiceboxTTS(truncatedText, voiceboxProfileId)
        modelUsed = "voicebox-qwen3-tts"
    } catch (err) {
        console.warn("[TTS] Voicebox failed, falling back:", err)
        // Fall through to OpenAI/MiniMax
    }
}
```

### 2. Specialist Voice Profile IDs (~30 minutes)

Add `voiceboxProfileId` to the `Specialist` interface and populate for each specialist:

```typescript
interface Specialist {
    // ... existing fields
    voice: string                    // OpenAI voice ID (fallback)
    voiceboxProfileId?: string       // Voicebox profile ID (preferred)
}
```

The TTS route receives the specialist's voice ID from the client. We add logic to look up the corresponding Voicebox profile ID on the server side, using a config map (env vars or a simple JSON config).

### 3. Voicebox Server Deployment (~half day)

**Option A — Docker sidecar** (recommended for self-hosted):
```yaml
# docker-compose.yml addition
voicebox:
  image: ghcr.io/jamiepine/voicebox-server:latest  # or build from source
  ports:
    - "8000:8000"
  volumes:
    - voicebox-data:/app/data
  deploy:
    resources:
      reservations:
        devices:
          - capabilities: [gpu]  # Optional, for CUDA acceleration
```

**Option B — Modal GPU worker** (recommended for cloud):
ForgeOS already uses Modal for `modal_cad_worker.py`, `modal_cfd_worker.py`, etc. Add a `modal_voicebox_worker.py` that wraps the Voicebox backend. Cold start ~30s, warm inference ~1-2s. Pay per GPU-second.

### 4. Voice Sample Curation (~2-3 days, non-engineering)

This is the creative work: sourcing or recording 30-60 second voice samples for each of the 13 specialists that match their personality descriptions.

| Specialist | Name | Personality | Voice Character Needed |
|---|---|---|---|
| strategist | Sage | Direct, blunt, short sentences | Male, authoritative, fast-paced |
| cto | Max | First-principles, technical, decisive | Male, calm, technical cadence |
| vp-engineering | Jian | Analytical, systematic, process-driven | Male, measured, precise |
| vp-manufacturing | Fang | Practical, efficiency-obsessed, Lean | Male, grounded, matter-of-fact |
| vp-supply-chain | Chase | Operational, risk-aware, logistics mind | Male, steady, detail-oriented |
| product-lead | Priya | User-obsessed, opinionated on UX | Female, energetic, empathetic |
| growth-marketer | Mia | Creative, brand-focused, storyteller | Female, warm, persuasive |
| sales-lead | Sal | Relationship-driven, closing-oriented | Male, confident, charismatic |
| chief-of-staff | Cal | Organized, cross-functional, diplomatic | Female, calm, organized |
| finance-lead | Finn | Numbers-driven, conservative, precise | Male, measured, analytical |
| fundraising-advisor | Fiona | Investor-savvy, narrative-focused | Female, articulate, compelling |
| hiring-team | Harper | People-first, culture-obsessed | Female, warm, approachable |
| legal-counsel | Leo | Cautious, thorough, protective | Male, deliberate, formal |

Options for sourcing voice samples:
- **Record actors** — highest quality, most control
- **Use royalty-free voice samples** — quick, decent quality
- **Use another TTS to generate "seed" audio** — bootstrap with OpenAI/MiniMax, then clone that as the Voicebox profile (meta but effective)
- **Crowd-source from team** — team members lend their voices to specialists

---

## What We Explicitly Should NOT Do (Yet)

| Feature | Why Not Now |
|---|---|
| Founder Voice Clone | Cool, but requires recording UI, quality validation, and per-user Voicebox profiles. Build after specialist voices prove the concept. |
| Audio Briefing Podcasts | Requires the Stories API integration and a content pipeline. Sequel to specialist voices. |
| Voice Admin Panel | Over-engineering. Start with config-file-based profile IDs. Add a UI only if voice management becomes a frequent operation. |
| Replace Whisper STT | The existing OpenAI Whisper endpoint works. The cost savings (~$3/mo at current scale) don't justify the infrastructure. Revisit at 10x scale. |
| Multilingual voices | Voicebox supports it, but ForgeOS specialists currently operate in English. Add language support when internationalization is a priority. |
| Voicebox for Realtime/PersonaPlex engines | These engines use WebSocket-based streaming audio, not HTTP TTS. Voicebox doesn't have a streaming API yet. Keep these on OpenAI Realtime / PersonaPlex. |

---

## Cost Analysis

**Current cost (cloud TTS):**
- OpenAI gpt-4o-mini-tts: ~$0.015 per 1K characters
- Average specialist response: ~500 characters = ~$0.0075 per TTS call
- At 1,000 voice interactions/month: ~$7.50/month
- At 10,000 voice interactions/month: ~$75/month

**Voicebox cost (self-hosted):**
- GPU instance (e.g., Modal A10G): ~$0.76/hour
- Average generation time: ~2 seconds per utterance
- At 1,000 voice interactions/month: ~$0.42/month in GPU time
- At 10,000 voice interactions/month: ~$4.20/month in GPU time

**Break-even:** Voicebox is cheaper than cloud TTS at virtually any scale, BUT the real value isn't cost savings — it's voice uniqueness that cloud TTS cannot provide at any price.

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Voicebox server goes down | Graceful fallback to OpenAI/MiniMax (already built into the provider switch) |
| Voice quality is worse than OpenAI | A/B test — if Voicebox quality is insufficient for a specialist, keep that specialist on OpenAI |
| Qwen3-TTS model discontinued | MIT-licensed, model weights are downloadable. Fork the backend if needed. |
| Cold start latency | Voice prompt caching reduces repeat calls to ~1-2s. Pre-warm on deployment. |
| Additional infrastructure burden | Docker container with health check. Same ops complexity as the existing Modal workers. |

---

## Implementation Order

1. **Deploy Voicebox server** (Docker or Modal) — verify it responds to health checks
2. **Add `voicebox` provider** to `/api/agents/tts/route.ts` with fallback
3. **Create voice profiles** for 2-3 specialists (Sage, Max, Priya) as a proof of concept
4. **Test the voice path** end-to-end: specialist chat → TTS → audio playback
5. **A/B compare** Voicebox-cloned voices vs. OpenAI stock voices
6. **If quality is good:** Create profiles for all 13 specialists and ship
7. **If quality needs work:** Iterate on voice samples, try different reference recordings

Steps 1-4 can be done in a single day. Step 5 is a judgment call. Steps 6-7 are curation work.

---

## Summary

Voicebox is not a new feature — it's a quality upgrade to an existing feature. ForgeOS already has the most sophisticated voice architecture I've seen in a productivity tool. The gap isn't "can specialists talk?" — they can. The gap is "do they sound like themselves?" They don't. Voicebox fixes that, through a single integration point, with graceful fallback, at lower cost than the current cloud TTS.

The recommendation: **add `voicebox` as a TTS provider, clone 13 specialist voices, ship it.**
