# Multi-Agent Architecture Plan & Red Team Analysis

## 1. Executive Summary
We propose transitioning CentaurOS from a monolithic "Ghost Worker" (`ai-worker.ts`) to a **Microservices Agent Architecture**. This involves breaking the single AI worker into specialized agents (Researcher, Coder, Reviewer) orchestrated by a central Dispatcher. This aligns with the "Agentic Design Patterns" advocated by Shubham Saboo (Google ADK).

## 2. Proposed Architecture

### A. The Orchestrator (The "Manager")
*   **Role:** The entry point for all AI tasks.
*   **Responsibility:**
    1.  Receives the raw task (e.g., "Fix the login bug").
    2.  Analyzes intent and complexity.
    3.  Selects the appropriate "Specialist" or "Pipeline".
*   **Implementation:** `src/lib/agents/orchestrator.ts`

### B. The Specialists (The "Workers")
We will extract logic from the monolith into focused, single-purpose agents:
1.  **ResearchAgent:**
    *   *Goal:* Gather context.
    *   *Tools:* `ContextAgent` (existing), Search (future).
    *   *Output:* A summary of the problem space.
2.  **CodingAgent:**
    *   *Goal:* Produce code.
    *   *Pattern:* "CodeACT" (Iterative coding).
    *   *Output:* Code diffs or file content.
3.  **ReviewAgent:**
    *   *Goal:* Quality assurance.
    *   *Prompt:* Focused on security, style, and best practices.
    *   *Output:* Approval or specific change requests.
4.  **PlanningAgent:**
    *   *Goal:* Break down high-level goals.
    *   *Refactor:* Move logic from `src/actions/analyze.ts` here.

### C. The Interface
All agents will implement a standard interface to ensure composability:
```typescript
interface SpecialistAgent {
    name: string;
    description: string;
    execute: (context: AgentContext) => Promise<AgentResponse>;
}
```

## 3. Red Team Analysis (Critique)

### Risk 1: Complexity Overhead
*   **Critique:** Replacing a single file (`ai-worker.ts`) with 5+ files and an orchestration layer adds significant cognitive load. For simple tasks (e.g., "Write a poem"), this over-engineering will increase latency and maintenance cost.
*   **Mitigation:** Implement a "Fast Path" in the Orchestrator. If the task is simple, route it directly to a generic `BasicAgent` (essentially the old worker), bypassing the complex pipeline.

### Risk 2: Latency & Cost
*   **Critique:** A sequential pipeline (Research -> Plan -> Code -> Review) implies 4x the LLM calls. This quadruples the cost and the time-to-first-token. Users might wait 60s+ for a response.
*   **Mitigation:**
    *   **Parallelization:** Run Research and Planning in parallel.
    *   **Streaming:** Stream the Orchestrator's "thought process" to the UI so the user knows *what* is happening (e.g., "Researching...", "Drafting...").
    *   **Caching:** Cache `ContextAgent` results aggressively.

### Risk 3: Error Propagation
*   **Critique:** If the `ResearchAgent` misses a key file, the `CodingAgent` will hallucinate. In a monolith, the model has all context in one window. In a pipeline, context is often summarized (lost) between steps.
*   **Mitigation:** Pass the *full* `AgentContext` object (including raw file references) to every agent, not just the summary from the previous step. Use a shared "Blackboard" state pattern.

### Risk 4: State Management
*   **Critique:** How do we persist the state of a multi-step chain? If the server crashes during step 3, is the task lost?
*   **Mitigation:** We need a `TaskRun` database table to log the state of each step. This allows us to resume or debug failed chains. (This is a large infrastructure lift).

### Risk 5: "Too Many Cooks"
*   **Critique:** The `ReviewAgent` might be too pedantic, rejecting valid code and causing infinite loops with the `CodingAgent`.
*   **Mitigation:**
    *   Limit the loop to max 2 retries.
    *   Give the `CodingAgent` the final say if it disagrees after 1 round.
    *   Make the `ReviewAgent` "Advisory" by default (it adds comments but doesn't block).

## 4. Recommendation
Proceed with the architecture but **start small**.
1.  Do **not** delete `ai-worker.ts` yet.
2.  Build the `Orchestrator` and `CodingAgent` first.
3.  Route only "Code Refactor" tasks to the new system.
4.  Keep "General" tasks on the old monolith until the new system proves stable.
