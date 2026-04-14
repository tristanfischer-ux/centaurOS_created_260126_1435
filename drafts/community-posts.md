# Community Posts — Reddit, Hacker News, Hardware Communities

---

## 1. Reddit r/hwstartups

**Title:** I built an AI that generates engineering packages for hardware startups — here's what it actually produces

**Body:**

Hey r/hwstartups — I've been lurking here for a while and finally have something worth sharing.

I'm a hardware founder myself and got frustrated with the 12-18 month gap between "I have a product idea" and "I have something a manufacturer can quote on." So I built a tool that does it in hours.

**What it does:** You describe your product in plain English. The AI generates:
- Product architecture and modular design
- Full BOM with cost modelling at 1K/10K/100K volumes  
- DFM analysis with manufacturing recommendations
- Competitive benchmarking
- Certification roadmap
- Matched UK suppliers (from a database of 13,700+)

**What it doesn't do:** It doesn't replace your engineering team. It gives you a comprehensive starting point so you spend your engineering budget refining, not starting from scratch.

**Real example:** I put through a solar-powered IoT irrigation controller for East African farms. In 3 hours I had a 48-component modular design, BOM with costs at three volumes, 3 flagged DFM issues, and 47 matched UK suppliers. A freelance engineer quoted me 6 weeks and £8,000 for the same scope.

It's called ForgeOS. Free tier available. Happy to answer questions about the tech or the approach.

[Link: fractionalforge.app]

---

## 2. Hacker News — Show HN

**Title:** Show HN: ForgeOS — AI generates engineering packages for hardware startups (STEP, BOM, DFM, suppliers)

**Body:**

Hi HN. I built ForgeOS because hardware startups have a structural problem that software startups don't: you have to build both the product AND the manufacturing infrastructure simultaneously.

ForgeOS uses 13 specialised AI agents (CTO, VP Manufacturing, Supply Chain, Finance, Legal, etc.) that collaborate to generate a complete engineering package from a product description:

- Product architecture with modular design
- Bill of materials with cost modelling at multiple volumes
- DFM analysis and manufacturing recommendations  
- Certification roadmap
- Matched suppliers from 13,700+ UK manufacturers

The agents have distinct expertise and actually challenge each other's assumptions — the VP Manufacturing will flag DFM issues the CTO's architecture creates, and the Finance lead will call out cost assumptions.

Stack: Next.js, TypeScript, Supabase, multi-LLM (Anthropic Claude + DeepSeek + OpenAI for embeddings). The specialist agents use a personality system with benchmarked quality scores.

Try it: fractionalforge.app (free tier, no credit card)

Happy to answer technical questions about the multi-agent architecture or the engineering package generation pipeline.

---

## 3. Hardware Slack/Discord Groups

**Shorter, more conversational:**

Hey everyone — I've been building something for the past 3 months that I think this community would find useful.

It's an AI platform that generates engineering packages from product descriptions. You type in what you're building, and it produces: architecture, BOM with costing, DFM analysis, certification roadmap, and matched UK suppliers. Takes about 3 hours instead of 4-8 weeks.

I'm personally onboarding the first 100 users. If anyone wants to try it with their own product, DM me and I'll walk you through it.

fractionalforge.app — free tier available.

Not trying to spam — genuinely want feedback from people building hardware. What would make this useful for YOUR product?
