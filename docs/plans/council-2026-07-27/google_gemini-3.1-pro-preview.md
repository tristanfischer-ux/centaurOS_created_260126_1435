Here is my independent judgement. I disagree with your recommendation to implement content-hash caching. 

### 1. Is content-hash keying right, or should the structural caches be removed?
**Remove the structural caches entirely.** Using a content-hash key will reduce cache hits for novel products to near zero. If a new product always misses the cache, you will inevitably hit the "domain-blind auto-planner fallback" anyway. By keeping the cache, you are simply hiding the inadequacy of the auto-planner behind past successful runs. 

A truly *universal* engine cannot rely on a cache of previously seen designs to function. If the auto-planner produces unrecoverable, 1/10 plausibility skeletons, then the auto-planner is fundamentally broken and must be fixed. To replace the robustness the caches provided, you must upgrade the auto-planner fallback: give it access to functional block decomposition techniques (e.g., EMS energy/mass/signal flow) rather than trying to memorize past structures.

### 2. Is `derived_requirement` keys + units the right determinant set?
**No.** Even if you ignored my first point and implemented a cache, derived requirements do not uniquely determine a module skeleton. Requirements define *quantitative constraints*. Structure is determined by *functional flows* (what energy, matter, or data must be transformed from input to output). Two products might share requirement keys (e.g., "target temperature", "max voltage", "environmental IP rating") but require entirely different modules to achieve them. Conversely, a 10V cycler and a 1000V cycler have different numeric requirements and potentially different units, but their topologies at the module skeleton level are nearly identical. Hashing requirements will yield spurious misses for identical topologies and spurious hits for functionally distinct ones. 

### 3. Should `class` be able to contribute structure at all?
**No, only defaults.** Class taxonomy is an entirely arbitrary human construct (as proven by placing a lab cycler into `consumer_electronics`). It is useful for determining regulatory constraints, safety factors, ambient operating assumptions, and vocabulary, but it is useless for physical structure. 
**To enforce this:** Radically sever the data models. The configuration struct/schema that defines a `ClassProfile` must not physically contain fields, properties, or methods for graphs, nodes, edges, or tools. If the class data structure cannot structurally hold a module definition, the engine cannot inherit one.

---

### 4. The FIRST thing to do
**Delete the three structural caches and your recent patch.** Rip them out cleanly. This will immediately expose how bad the auto-planner truly is. You must force the engine to design from scratch on every run so that you can diagnose and fix the real issue: why a universal engine cannot synthesize a coherent skeleton for a novel brief. Only by breaking the crutch will you be forced to fix the leg.

### 5. The strongest argument AGAINST my position
Removing the caches will immediately degrade the engine's performance on *existing/known* products. Runs that previously resulted in coherent designs because they hit a cached, human-approved (or lucky) skeleton will suddenly plummet to 1/10 plausibility. Furthermore, cost and latency per run will spike because you are forcing full LLM inference for the module skeleton and tool plans every single time. It sacrifices short-term stability for long-term architectural correctness.

### 6. What to measure and the failure condition
**Measure:** The delta in "Skeleton Critic Plausibility" and "Internal Coherence" scores on the pure auto-planner fallback across a test suite of ten radically different products (e.g., cell cycler, bioreactor, generic drone). 
**Failure Condition:** If, after ripping out the caches and dedicating a sprint to improving the auto-planner, the engine still consistently scores ≤ 3/10 on plausibility for novel briefs, the change has failed. It would prove that the LLM pipeline currently lacks the capacity to reliably perform zero-shot functional decomposition, meaning structural caching (with all its flaws) is a harsh but necessary reality for your current AI capability.