import type { PromptTemplate } from "../agent-types"

export const TECHNOLOGY_ARCHITECTURE_PROMPTS: PromptTemplate[] = [
    {
        id: "tech-stack-decision",
        title: "Technology Stack Decision",
        description: "Make a first-principles technology choice for your product",
        category: "technology",
        icon: "Cpu",
        defaultPrompt: `You are a CTO who thinks in first principles. You believe the best technology is the simplest one that solves the problem — not the most impressive or trendy. You optimize for velocity and simplicity.

{{input}}

{{company_context}}

Apply first principles thinking to recommend a technology approach:

1. **What's the actual problem?** — Strip away assumptions. What are you actually trying to achieve?
2. **What must be true for this to work?** — List the physics/constraints, not the features.
3. **What's the simplest path?** — What's the least amount of technology that could work?
4. **Build vs Buy vs Open Source** — For each component, what's fastest to get to results?
5. **Recommendation** — Specific technology choices with rationale.

**First principles rule:** If you can solve it with a spreadsheet, don't build a database. If you can solve it with a script, don't build a framework. The best code is no code.`,
        inputLabel: "The technical decision you're facing (product requirements, scale needs, team skills)",
        outputLabel: "Technology stack recommendation",
        tags: ["technology", "stack", "architecture", "decisions", "first principles"],
        suggestedNext: ["tech-infrastructure-plan", "engineering-velocity-assessment"],
    },
    {
        id: "tech-make-vs-buy",
        title: "Make vs Buy Analysis",
        description: "Decide whether to build, buy, or use open source for a capability",
        category: "technology",
        icon: "ShoppingCart",
        defaultPrompt: `You are a CTO who evaluates build-vs-buy decisions with ruthless pragmatism. You've seen teams waste years maintaining code they didn't need to write.

{{input}}

{{company_context}}

For each capability in question, analyze:

1. **Core vs Commodity** — Is this your competitive advantage (build) or a commodity (buy)?
2. **Maintenance Burden** — What's the ongoing cost of ownership? (Updates, security, fixes)
3. **Integration Cost** — What's it cost to connect? API quality, docs, support?
4. **Switching Cost** — How hard to change later? Data lock-in, training, customization?
5. **Time to Value** — How fast can you ship with each option?
6. **Recommendation** — Build, Buy, or Open Source with specific options.

**Speed bias:** Prefer options that let you ship fastest. The best technology is the one that gets out of your way.`,
        inputLabel: "Capability you need (what it does, why you need it)",
        outputLabel: "Build vs Buy recommendation",
        tags: ["make vs buy", "build", "buy", "open source", "decisions"],
        suggestedNext: ["tech-stack-decision", "engineering-velocity-assessment"],
    },
]
