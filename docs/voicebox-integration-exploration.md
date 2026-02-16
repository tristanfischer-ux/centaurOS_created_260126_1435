# Voicebox Integration Exploration

## What is Voicebox?

[Voicebox](https://github.com/jamiepine/voicebox) is an **open-source, local-first voice cloning studio** — a self-hosted alternative to ElevenLabs. It lets you clone voices from audio samples and generate speech using those cloned voices, all running on your own hardware.

**Key facts:**
- **License:** MIT (fully permissive — use, modify, distribute freely)
- **Architecture:** FastAPI backend (Python) + React/TypeScript frontend + Tauri desktop wrapper
- **Voice Model:** Qwen3-TTS (Alibaba) — near-perfect voice cloning from seconds of audio
- **STT:** Whisper (OpenAI) — for transcription
- **Inference:** MLX (Apple Silicon with Metal) / PyTorch (Windows/Linux/CUDA)
- **API-first:** Full REST API at `localhost:8000` with OpenAPI spec

---

## What Voicebox Can Do

| Capability | Description |
|---|---|
| **Voice Cloning** | Clone any voice from a few seconds of audio reference |
| **Voice Profiles** | Manage named voice identities with multiple reference samples |
| **Text-to-Speech** | Generate speech in any cloned voice |
| **Multi-language** | English, Chinese, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian |
| **Transcription** | Whisper-based audio-to-text |
| **Stories/Multi-track** | DAW-like timeline editor for multi-voice narratives |
| **Voice Prompt Caching** | First generation ~5-10s, subsequent ~1-2s |
| **Self-hosted** | No cloud dependency, complete data privacy |
| **REST API** | Full API for programmatic integration |

---

## Current ForgeOS Voice Capabilities

ForgeOS already has a voice infrastructure:

| Component | What it does | Provider |
|---|---|---|
| `use-tts.ts` | Text-to-speech playback hook | OpenAI gpt-4o-mini-tts / MiniMax Speech 2.6 |
| `use-speech-recognition.ts` | Speech-to-text via Whisper | OpenAI Whisper-1 |
| `voice-recorder.tsx` | Voice-to-task creation | OpenAI Whisper + GPT-4o |
| `/api/agents/tts/route.ts` | TTS API proxy | OpenAI / MiniMax |
| `/api/agents/stt/route.ts` | STT API proxy | OpenAI Whisper |
| `/api/voice-to-task/route.ts` | Voice command → task | OpenAI pipeline |
| `realtime-voice-engine.ts` | Bidirectional voice conversations | OpenAI Realtime API |
| `personaplex-voice-engine.ts` | Full-duplex voice conversations | NVIDIA PersonaPlex |
| `half-duplex-voice-engine.ts` | Turn-based voice conversations | STT → LLM → TTS pipeline |
| `specialists-data.ts` | 13 specialists with OpenAI voice IDs | OpenAI TTS voices |

**Current limitations:**
1. All TTS uses generic cloud voices (OpenAI's `alloy`, `coral`, `echo`, etc. or MiniMax equivalents)
2. Cloud API costs for every utterance ($0.015/1K chars for OpenAI TTS, ~$0.06-0.24/min for Realtime)
3. No custom/branded voice — specialists sound like stock AI voices
4. No user voice cloning — users can't create voice profiles
5. Internet required for all voice operations

---

## Integration Opportunities

### 1. Custom Specialist Voices (High Impact, Medium Effort)

**The idea:** Instead of using OpenAI's stock voices (`alloy`, `echo`, `coral`), give each of the 13 ForgeOS specialists a unique, cloned voice identity.

**How it works:**
1. Run Voicebox server alongside ForgeOS (self-hosted or on a GPU instance)
2. Create Voicebox voice profiles for each specialist (Sage, Max, Mia, etc.)
3. Record or source distinctive voice samples for each character
4. Add a new TTS provider (`"voicebox"`) in the existing provider switch in `/api/agents/tts/route.ts`
5. Map specialist voice IDs to Voicebox profile IDs

**Integration point — `/api/agents/tts/route.ts`:**

```typescript
// New provider alongside existing openai/minimax
async function generateVoiceboxTTS(text: string, profileId: string): Promise<ArrayBuffer> {
    const VOICEBOX_URL = process.env.VOICEBOX_API_URL ?? "http://localhost:8000"
    
    // Generate speech using cloned voice profile
    const genResponse = await fetch(`${VOICEBOX_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            profile_id: profileId,
            text,
            language: "en",
        }),
    })
    
    const generation = await genResponse.json()
    
    // Download the generated audio
    const audioResponse = await fetch(`${VOICEBOX_URL}/audio/${generation.id}`)
    return audioResponse.arrayBuffer()
}
```

**Why this matters:**
- Each specialist gets a truly unique, memorable voice
- Zero per-request cloud cost after initial setup
- Runs on your own infrastructure — complete privacy
- Can iterate on voices without API rate limits
- Much faster iteration on voice quality (adjust samples, regenerate)

**Effort estimate:** 2-3 days for integration, plus voice recording/curation time.

---

### 2. Founder's Voice Clone (High Impact, Low Effort)

**The idea:** Let the founder record their own voice and use it for AI-generated audio content — briefings, narrated reports, podcast-style updates.

**How it works:**
1. Add a "Clone My Voice" flow in Settings
2. User records 30-60 seconds of speech (reuse existing `voice-recorder.tsx` pattern)
3. Upload samples to Voicebox backend to create a voice profile
4. Use the cloned voice for:
   - Morning briefing narration (Today page)
   - Weekly report audio summaries
   - Specialist outputs read in the founder's voice (optional)
   - Internal team audio messages

**Integration point — new settings section:**

```typescript
// Settings flow: Record → Upload → Create Profile → Save ID
const createVoiceProfile = async (audioSamples: Blob[], name: string) => {
    const VOICEBOX_URL = process.env.VOICEBOX_API_URL
    
    // 1. Create profile
    const profile = await fetch(`${VOICEBOX_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, language: "en" }),
    }).then(r => r.json())
    
    // 2. Upload each audio sample
    for (const sample of audioSamples) {
        const formData = new FormData()
        formData.append("file", sample, "sample.wav")
        formData.append("reference_text", "Voice reference sample")
        await fetch(`${VOICEBOX_URL}/profiles/${profile.id}/samples`, {
            method: "POST",
            body: formData,
        })
    }
    
    return profile.id
}
```

**Why this matters:**
- "Show a friend" moment — hearing your own voice narrate your company briefing
- Deeply personal touch that cloud TTS cannot provide
- Competitive differentiator — no other platform does this

**Effort estimate:** 1-2 days for the recording/upload flow, reusing existing voice-recorder patterns.

---

### 3. AI Agent Voice Identity System (Medium Impact, Medium Effort)

**The idea:** Build a system where each AI specialist has a persistent, evolving voice identity managed through Voicebox, complete with voice profile CRUD in the admin panel.

**How it works:**
1. Add a `voicebox_profile_id` column to the specialists data
2. Create an admin page for managing specialist voice profiles
3. Allow admin to upload reference audio or record in-browser
4. Preview voices before committing
5. Hot-swap specialist voices without code changes

**Data model extension:**

```typescript
// Extend Specialist interface
interface Specialist {
    // ... existing fields
    voice: string  // OpenAI voice ID (fallback)
    voiceboxProfileId?: string  // Voicebox cloned voice (preferred)
}
```

**TTS selection logic:**

```typescript
// In TTS route — prefer Voicebox when available
if (specialist.voiceboxProfileId && isVoiceboxAvailable()) {
    return generateVoiceboxTTS(text, specialist.voiceboxProfileId)
} else {
    // Fall back to OpenAI/MiniMax
    return generateCloudTTS(text, specialist.voice)
}
```

---

### 4. Voice-Powered Content Generation (Medium Impact, Medium Effort)

**The idea:** Use Voicebox to generate audio versions of content ForgeOS already produces — turning text outputs into listenable content.

**Use cases:**
- **Morning Briefing Audio:** Generate a spoken version of the daily briefing, narrated by a specialist or the founder's clone
- **Weekly Report Podcast:** Auto-generate a multi-voice podcast from weekly reports (different specialists narrate their sections)
- **Task Audio Notes:** Attach voice recordings or AI-narrated descriptions to tasks
- **Team Meeting Summaries:** Convert meeting transcripts into digestible audio summaries

**Multi-voice story integration:**

```typescript
// Using Voicebox Stories API for multi-speaker content
const createAudioBriefing = async (sections: BriefingSection[]) => {
    const VOICEBOX_URL = process.env.VOICEBOX_API_URL
    
    // 1. Create a story
    const story = await fetch(`${VOICEBOX_URL}/stories`, {
        method: "POST",
        body: JSON.stringify({ name: `Briefing ${new Date().toLocaleDateString()}` }),
    }).then(r => r.json())
    
    // 2. Generate each section with the appropriate specialist voice
    for (const section of sections) {
        const generation = await fetch(`${VOICEBOX_URL}/generate`, {
            method: "POST",
            body: JSON.stringify({
                profile_id: section.specialistVoiceProfileId,
                text: section.content,
                language: "en",
            }),
        }).then(r => r.json())
        
        // 3. Add to story timeline
        await fetch(`${VOICEBOX_URL}/stories/${story.id}/items`, {
            method: "POST",
            body: JSON.stringify({ generation_id: generation.id }),
        })
    }
    
    // 4. Export combined audio
    return `${VOICEBOX_URL}/stories/${story.id}/export`
}
```

---

### 5. Local STT as Whisper Alternative (Low Impact, Low Effort)

**The idea:** Use Voicebox's built-in Whisper endpoint for speech-to-text instead of paying OpenAI for Whisper API calls.

**How it works:**
- Voicebox bundles Whisper (PyTorch or MLX) and exposes `POST /transcribe`
- Replace the OpenAI Whisper call in `/api/agents/stt/route.ts` with a Voicebox call
- Same accuracy, zero cloud cost

**Integration point — `/api/agents/stt/route.ts`:**

```typescript
// Replace:
const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
    language: "en",
})

// With:
const formData = new FormData()
formData.append("file", file)
formData.append("language", "en")
const result = await fetch(`${VOICEBOX_URL}/transcribe`, {
    method: "POST",
    body: formData,
}).then(r => r.json())
const transcription = result.text
```

**Savings:** OpenAI Whisper costs $0.006/min. At 1000 transcriptions/month averaging 30 seconds each, that's ~$3/month — modest savings but adds up with scale, and eliminates an external dependency.

---

### 6. Multilingual Voice Support (Low-Medium Impact, Low Effort)

**The idea:** Voicebox supports 10 languages out of the box. ForgeOS could offer specialist interactions in multiple languages with proper localized voices.

**Supported languages:** English, Chinese, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian

This aligns with ForgeOS's potential international expansion — specialists could speak in the founder's native language.

---

## Architecture Recommendations

### Deployment Option A: Sidecar Service (Recommended for Self-Hosted)

```
┌─────────────────────────────────────────────┐
│  ForgeOS Infrastructure                      │
│                                              │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │  ForgeOS App  │───▶│  Voicebox Server  │  │
│  │  (Next.js)    │◀───│  (FastAPI)        │  │
│  └──────────────┘    └───────────────────┘  │
│       :3000              :8000               │
│                          ┌─────────┐        │
│                          │ Qwen3-TTS│        │
│                          │ Whisper   │        │
│                          └─────────┘        │
└─────────────────────────────────────────────┘
```

- Run Voicebox server as a Docker sidecar
- ForgeOS calls Voicebox API internally over local network
- GPU recommended for production (Apple Silicon M1+ or NVIDIA CUDA)
- SQLite database for voice profiles stored in Docker volume

### Deployment Option B: Optional Integration (Recommended for Cloud/SaaS)

```
┌──────────────────────┐     ┌──────────────────────┐
│  ForgeOS Cloud       │     │  Voicebox (optional)  │
│                      │     │                       │
│  TTS: OpenAI/MiniMax │     │  Self-hosted by user  │
│  (default, always on)│     │  on local GPU          │
│                      │     │                       │
│  Config:             │     │                       │
│  VOICEBOX_API_URL=   │────▶│  :8000                │
│  (optional override) │     │                       │
└──────────────────────┘     └──────────────────────┘
```

- Cloud ForgeOS keeps existing OpenAI/MiniMax TTS as default
- Users who self-host can optionally point to their own Voicebox instance
- Graceful fallback: if Voicebox is unavailable, use cloud TTS

### Deployment Option C: GPU Worker via Modal/Replicate

```
┌──────────────────────┐     ┌──────────────────────┐
│  ForgeOS Cloud       │     │  Modal/Replicate      │
│                      │────▶│  GPU Worker            │
│  /api/agents/tts     │     │  Voicebox Backend      │
│                      │◀────│  (A100 GPU)           │
└──────────────────────┘     └──────────────────────┘
```

- Deploy Voicebox backend as a serverless GPU function on Modal or Replicate
- ForgeOS already uses Modal workers (see `modal_cad_worker.py`, etc.)
- Cold start ~30s, warm inference ~1-2s
- Pay only for GPU seconds used

---

## Implementation Priority

| Priority | Integration | Value | Effort | Dependencies |
|---|---|---|---|---|
| **1** | Custom Specialist Voices | Unique identity for all 13 specialists | Medium | Voicebox server + voice samples |
| **2** | Founder's Voice Clone | Personal, delightful UX | Low | Voicebox server |
| **3** | Local STT (Whisper) | Cost savings, independence | Low | Voicebox server |
| **4** | Audio Briefings/Podcasts | Content accessibility | Medium | Priorities 1-2 |
| **5** | Voice Admin Panel | Operational flexibility | Medium | Priority 1 |
| **6** | Multilingual Voices | International expansion | Low | Priority 1 |

---

## Environment Variables

```bash
# Voicebox integration (optional — falls back to OpenAI/MiniMax if not set)
VOICEBOX_API_URL=http://localhost:8000
VOICEBOX_ENABLED=true

# Per-specialist voice profile IDs (managed via admin panel in production)
VOICEBOX_PROFILE_STRATEGIST=<uuid>
VOICEBOX_PROFILE_CTO=<uuid>
# ... etc
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| GPU requirement for inference | Apple Silicon M1+ works great; CPU fallback available (slower) |
| Cold-start latency (~5-10s first generation) | Voice prompt caching reduces subsequent calls to 1-2s |
| Quality vs cloud TTS | Qwen3-TTS quality is competitive; can A/B test against OpenAI |
| Additional infrastructure to manage | Docker container with health checks; optional integration |
| Model size (2-4GB) | One-time download; cached permanently |
| Audio format compatibility | Voicebox outputs WAV; ForgeOS already handles WAV via AudioContext |

---

## Quick Start for Evaluation

To try Voicebox locally right now:

```bash
# 1. Clone and install
git clone https://github.com/jamiepine/voicebox.git
cd voicebox/backend
pip install -r requirements.txt

# 2. Start the server
python -m backend.main --port 8000

# 3. Test the API
curl http://localhost:8000/health

# 4. Create a voice profile
curl -X POST http://localhost:8000/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Voice", "language": "en"}'

# 5. Add a sample (you'll need a WAV file)
curl -X POST http://localhost:8000/profiles/<profile_id>/samples \
  -F "file=@sample.wav" \
  -F "reference_text=This is a test voice sample"

# 6. Generate speech
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"profile_id": "<profile_id>", "text": "Hello from ForgeOS!", "language": "en"}'
```

---

## Conclusion

Voicebox is a strong fit for ForgeOS because:

1. **It solves the "generic voice" problem** — Specialists get unique, memorable voices instead of stock AI voices
2. **It's API-first** — Clean REST API maps directly onto ForgeOS's existing TTS architecture
3. **It's self-hosted** — Aligns with ForgeOS's privacy-conscious, professional audience
4. **It's MIT licensed** — No licensing concerns
5. **The integration is additive** — Can be layered on top of existing cloud TTS as an optional upgrade, with graceful fallback

The highest-impact first step would be **custom specialist voices** (Priority 1) combined with **founder's voice clone** (Priority 2). These together create a genuinely differentiated product experience that would make users "pull out their phone to show a friend."
