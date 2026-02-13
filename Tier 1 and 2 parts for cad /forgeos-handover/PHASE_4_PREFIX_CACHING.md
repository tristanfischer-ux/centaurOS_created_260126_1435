1_000_000
        cost_with = (shared_tokens * 3.0 / 1_000_000) + (shared_tokens * (total_calls - 1) * 0.30 / 1_000_000)

        return {
            "shared_context_tokens": shared_tokens,
            "total_api_calls": total_calls,
            "tokens_without_cache": tokens_without_cache,
            "estimated_cost_without_usd": round(cost_without, 4),
            "estimated_cost_with_cache_usd": round(cost_with, 4),
            "estimated_savings_usd": round(cost_without - cost_with, 4),
            "savings_percent": round((1 - cost_with / cost_without) * 100, 1) if cost_without > 0 else 0,
        }

    def _estimate_shared_tokens(self) -> int:
        total_chars = len(self.SYSTEM_CONTEXT)
        if self._component_library:
            total_chars += len(self._component_library)
        if self._requirements:
            total_chars += len(self._requirements)
        return total_chars // CHARS_PER_TOKEN

    def update_stats(self, usage: dict) -> None:
        """Update cache stats from an API response's usage dict."""
        self.stats.total_calls += 1
        self.stats.total_input_tokens += usage.get("input_tokens", 0)
        self.stats.total_output_tokens += usage.get("output_tokens", 0)

        cache_read = usage.get("cache_read_input_tokens", 0)
        cache_create = usage.get("cache_creation_input_tokens", 0)
        self.stats.cache_read_tokens += cache_read
        self.stats.cache_creation_tokens += cache_create

        if cache_read > 0:
            self.stats.cache_hits += 1
        else:
            self.stats.cache_misses += 1
```

---

### `backend/llm/client.py`

```python
"""Anthropic API client wrapper with cache tracking.

Thin wrapper that handles cache-aware calls and tracks performance.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import anthropic

from .prompt_builder import ForgePromptBuilder

logger = logging.getLogger(__name__)


class ForgeLLMClient:
    """Anthropic API client for ForgeOS with prompt caching support."""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        prompt_builder: ForgePromptBuilder | None = None,
    ) -> None:
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.prompt_builder = prompt_builder or ForgePromptBuilder()

    async def call_agent(
        self,
        design_state: dict,
        agent_instruction: str,
        decision_log: list[str] | None = None,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Make a cache-aware API call for a design agent.

        Args:
            design_state: Current design parameters and constraints
            agent_instruction: What this specific agent should do
            decision_log: Recent design decisions for context
            max_tokens: Max response tokens

        Returns:
            Parsed JSON response from the model
        """
        messages = self.prompt_builder.build_agent_prompt(
            design_state=design_state,
            agent_instruction=agent_instruction,
            decision_log=decision_log,
        )

        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=messages,
        )

        # Track cache stats
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0),
            "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0),
        }
        self.prompt_builder.update_stats(usage)

        # Parse response
        text = response.content[0].text
        try:
            # Try to extract JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            parsed = json.loads(text)
        except (json.JSONDecodeError, IndexError):
            parsed = {"raw_text": text, "parse_error": True}

        return {
            "content": parsed,
            "usage": usage,
        }

    def get_cache_report(self) -> dict:
        """Return cache performance stats."""
        return self.prompt_builder.stats.to_dict()
```

---

### `backend/llm/variant_explorer.py`

```python
"""Variant Explorer — explores multiple design variants from shared requirements.

Structures exploration as a tree: shared context is the trunk,
each variant is a branch. Runs variants sequentially to maximise
cache hits (first call creates cache, subsequent calls read from it).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .prompt_builder import ForgePromptBuilder
from backend.scoring.scorer import ScoreBreakdown, TrajectoryScorer
from backend.scoring.trajectory import DesignTrajectory

logger = logging.getLogger(__name__)


@dataclass
class VariantConfig:
    """Configuration for a design variant."""

    name: str
    description: str
    param_overrides: dict[str, Any] = field(default_factory=dict)


@dataclass
class VariantResult:
    """Result of exploring a single design variant."""

    name: str
    description: str
    overrides: dict[str, Any]
    trajectory: DesignTrajectory
    score: ScoreBreakdown
    rank: int = 0


# Default variant configurations for drone design
DEFAULT_DRONE_VARIANTS = [
    VariantConfig(
        name="lightweight",
        description="Optimised for minimum weight and maximum flight time",
        param_overrides={"material": "cf_petg", "weight_reduction_holes": True, "arm_thickness_mm": 2.5},
    ),
    VariantConfig(
        name="robust",
        description="Optimised for durability and crash resistance",
        param_overrides={"material": "nylon", "weight_reduction_holes": False, "arm_thickness_mm": 4.0, "arm_fillet_radius_mm": 3.0},
    ),
    VariantConfig(
        name="budget",
        description="Optimised for low material cost",
        param_overrides={"material": "pla", "weight_reduction_holes": True, "arm_thickness_mm": 3.0},
    ),
]


class VariantExplorer:
    """Explores multiple design variants with shared prompt context."""

    def __init__(
        self,
        prompt_builder: ForgePromptBuilder,
        scorer: TrajectoryScorer | None = None,
    ) -> None:
        self.prompt_builder = prompt_builder
        self.scorer = scorer or TrajectoryScorer()

    def setup_shared_context(self, requirements: str, component_library: str | None = None) -> dict:
        """Set shared context and return estimated savings.

        Call this ONCE before explore_variants().
        """
        if component_library is None:
            component_library = self._default_component_library()

        self.prompt_builder.set_shared_context(
            component_library=component_library,
            requirements=requirements,
        )

        return self.prompt_builder.estimate_cache_savings(
            num_variants=3,
            iterations_per_variant=5,
        )

    def rank_variants(self, trajectories: list[tuple[str, DesignTrajectory]]) -> list[VariantResult]:
        """Score and rank completed variant trajectories.

        Args:
            trajectories: List of (variant_name, trajectory) tuples

        Returns:
            Sorted list of VariantResults, best first
        """
        results = []
        for name, trajectory in trajectories:
            score = self.scorer.score(trajectory)
            results.append(
                VariantResult(
                    name=name,
                    description="",
                    overrides={},
                    trajectory=trajectory,
                    score=score,
                )
            )

        results.sort(key=lambda r: r.score.total_score, reverse=True)
        for i, r in enumerate(results):
            r.rank = i + 1

        return results

    def _default_component_library(self) -> str:
        """Stub component library for development. Replace with real data in production."""
        return """Available Motors:
- EMAX ECO II 2207 1700KV: max_thrust=680g, weight=30g, max_current=28A
- EMAX ECO II 2207 2400KV: max_thrust=750g, weight=30g, max_current=32A (racing)
- T-Motor F40 Pro IV 2306 1750KV: max_thrust=720g, weight=33g, max_current=30A

Available Flight Controllers:
- SpeedyBee F405 V4: weight=8g, mount=20x20, voltage=3-6S
- Matek F722-SE: weight=10g, mount=30.5x30.5, voltage=3-6S

Available Batteries:
- GNB 4S 1300mAh 120C: weight=165g, dimensions=75x35x30mm
- GNB 6S 1100mAh 120C: weight=185g, dimensions=70x35x35mm
- Tattu 4S 1550mAh 75C: weight=195g, dimensions=80x40x32mm

Available Cameras:
- RunCam Thumb Pro: weight=16g, dimensions=55x25x22mm
- Caddx Peanut: weight=7.5g, dimensions=19x19x20mm
- GoPro Hero 12 Mini: weight=120g, dimensions=52x44x25mm

3D Print Materials: PLA, PETG, ABS, Nylon, CF-PETG, TPU
See materials database for engineering properties."""
```

---

### `backend/tests/test_phase4.py`

```python
"""Tests for Phase 4: Prefix Caching.

Run with: pytest backend/tests/test_phase4.py -v
"""

from __future__ import annotations

import pytest

from backend.llm.prompt_builder import CacheStats, ForgePromptBuilder
from backend.llm.variant_explorer import VariantExplorer
from backend.scoring.trajectory import DesignTrajectory


class TestPromptBuilder:
    def test_build_prompt_with_cache_breakpoint(self):
        pb = ForgePromptBuilder()
        pb.set_shared_context(
            component_library="Motor A: 30g\nMotor B: 35g",
            requirements="Build a 5 inch FPV racing drone, 400g target mass",
        )

        messages = pb.build_agent_prompt(
            design_state={
                "params": {"arm_thickness_mm": 3.0},
                "material": "petg",
                "active_constraints": [],
                "iteration": 0,
            },
            agent_instruction="Analyse the structural integrity of the arm design.",
        )

        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert len(messages[0]["content"]) == 2

        # First content block should have cache_control
        assert "cache_control" in messages[0]["content"][0]
        assert messages[0]["content"][0]["cache_control"]["type"] == "ephemeral"

        # Second content block should NOT have cache_control
        assert "cache_control" not in messages[0]["content"][1]

        # Shared context should be in first block
        assert "Component Library" in messages[0]["content"][0]["text"]
        assert "Motor A" in messages[0]["content"][0]["text"]

        # Variable content should be in second block
        assert "arm_thickness_mm" in messages[0]["content"][1]["text"]

    def test_raises_without_shared_context(self):
        pb = ForgePromptBuilder()
        with pytest.raises(ValueError, match="set_shared_context"):
            pb.build_agent_prompt(
                design_state={"params": {}},
                agent_instruction="test",
            )

    def test_estimate_cache_savings(self):
        pb = ForgePromptBuilder()
        pb.set_shared_context(
            component_library="x" * 4000,  # ~1000 tokens
            requirements="y" * 2000,        # ~500 tokens
        )
        estimate = pb.estimate_cache_savings(num_variants=3, iterations_per_variant=5)
        assert estimate["total_api_calls"] == 15
        assert estimate["savings_percent"] > 50
        assert estimate["estimated_savings_usd"] > 0

    def test_decision_log_included(self):
        pb = ForgePromptBuilder()
        pb.set_shared_context(component_library="test", requirements="test")
        messages = pb.build_agent_prompt(
            design_state={"params": {}, "iteration": 3},
            agent_instruction="test",
            decision_log=[
                "Iter 0: thickness 2.0→2.5 (stress)",
                "Iter 1: thickness 2.5→3.0 (stress)",
                "Iter 2: fillet 1.0→2.0 (concentration)",
            ],
        )
        variable_text = messages[0]["content"][1]["text"]
        assert "thickness 2.0" in variable_text
        assert "Recent Design Decisions" in variable_text


class TestCacheStats:
    def test_stats_tracking(self):
        stats = CacheStats()
        # First call — cache miss
        stats.total_calls += 1
        stats.cache_misses += 1
        stats.total_input_tokens += 5000
        stats.cache_creation_tokens += 4000
        assert stats.hit_rate == 0.0

        # Second call — cache hit
        stats.total_calls += 1
        stats.cache_hits += 1
        stats.total_input_tokens += 5000
        stats.cache_read_tokens += 4000
        assert stats.hit_rate == 0.5
        assert stats.estimated_savings_usd > 0

    def test_to_dict(self):
        stats = CacheStats(total_calls=10, cache_hits=8, cache_misses=2, cache_read_tokens=50000)
        d = stats.to_dict()
        assert d["hit_rate"] == 0.8
        assert "estimated_savings_usd" in d


class TestVariantExplorer:
    def test_rank_variants(self):
        explorer = VariantExplorer(prompt_builder=ForgePromptBuilder())

        good = DesignTrajectory(
            run_id="good",
            total_iterations=3,
            iterations_to_converge=3,
            final_safety_factor=2.2,
            final_dfm_score=0.95,
            final_mass_g=400,
            constraints_resolved=3,
            constraints_remaining=0,
        )
        bad = DesignTrajectory(
            run_id="bad",
            total_iterations=12,
            iterations_to_converge=0,
            final_safety_factor=1.1,
            final_dfm_score=0.6,
            final_mass_g=550,
            constraints_resolved=1,
            constraints_remaining=3,
        )

        ranked = explorer.rank_variants([("budget", bad), ("lightweight", good)])
        assert ranked[0].name == "lightweight"
        assert ranked[0].rank == 1
        assert ranked[1].name == "budget"
        assert ranked[1].rank == 2

    def test_setup_shared_context(self):
        pb = ForgePromptBuilder()
        explorer = VariantExplorer(prompt_builder=pb)
        estimate = explorer.setup_shared_context(
            requirements="Build a 5 inch FPV drone for racing"
        )
        assert "total_api_calls" in estimate
        assert "savings_percent" in estimate
        # Verify shared context was set
        messages = pb.build_agent_prompt(
            design_state={"params": {}, "iteration": 0},
            agent_instruction="test",
        )
        assert "Available Motors" in messages[0]["content"][0]["text"]
```

---

### Verification

```bash
pytest backend/tests/test_phase4.py -v
```

All tests should pass, confirming:
- Prompts structured with cache_control breakpoints in correct position
- Shared context in first (cached) block, variable content in second block
- Savings estimates are reasonable (>50% for multi-variant exploration)
- Variant ranking works correctly
- Stats tracking correctly counts hits/misses
