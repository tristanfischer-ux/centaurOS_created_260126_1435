# Phase 3: Efficiency-Aware Trajectory Scoring

## What This Is

A scoring system that rates completed pipeline runs by both design quality AND execution efficiency. Scores are transparent (full breakdown visible) and stored for later use as RL reward signals.

## Why

When ForgeOS explores multiple design variants, we need to rank them. A design that converges in 3 iterations with a safety factor of 2.1 is better than one that took 12 iterations to reach the same result. The efficiency component also creates a feedback signal for optimising the pipeline itself.

## Dependencies

Requires Phase 1 (uses models) and Phase 2 (uses audit trail data).

## Files to Create

---

### `backend/scoring/__init__.py`

```python
"""ForgeOS Trajectory Scoring — rates design runs by outcome quality and efficiency."""
```

---

### `backend/scoring/trajectory.py`

```python
"""Trajectory data model — captures everything about a pipeline run for scoring.

The orchestrator populates this during execution. After the pipeline
completes, the scorer evaluates it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class StageExecution:
    """Record of a single agent execution within a pipeline run."""

    agent_id: str
    iteration: int
    started_at: float  # time.perf_counter_ns()
    completed_at: float
    execution_ms: int
    ran_parallel_with: list[str] = field(default_factory=list)
    was_skipped: bool = False
    was_error: bool = False


@dataclass
class DesignTrajectory:
    """Complete record of a pipeline run, ready for scoring."""

    run_id: str
    started_at: datetime | None = None
    completed_at: datetime | None = None

    # Execution metrics
    total_iterations: int = 0
    iterations_to_converge: int = 0  # 0 = did not converge
    stage_executions: list[StageExecution] = field(default_factory=list)
    total_agent_calls: int = 0
    total_wall_clock_ms: int = 0

    # Design outcome
    final_params: dict[str, Any] = field(default_factory=dict)
    final_safety_factor: float = 0.0
    final_dfm_score: float = 0.0
    final_mass_g: float = 0.0
    final_cg_offset_mm: float = 0.0
    constraints_resolved: int = 0
    constraints_remaining: int = 0

    # Cost
    estimated_material_cost_usd: float = 0.0
    estimated_print_time_min: float = 0.0

    # Dampening events (from Phase 2)
    oscillation_events: int = 0
    dampened_params: list[str] = field(default_factory=list)

    @property
    def parallel_stages(self) -> int:
        """Count of agent executions that ran concurrently with another agent."""
        return sum(1 for s in self.stage_executions if len(s.ran_parallel_with) > 0 and not s.was_skipped)

    @property
    def sequential_stages(self) -> int:
        """Count of agent executions that ran alone in their level."""
        return sum(1 for s in self.stage_executions if len(s.ran_parallel_with) == 0 and not s.was_skipped)

    @property
    def total_stages(self) -> int:
        return self.parallel_stages + self.sequential_stages

    @property
    def did_converge(self) -> bool:
        return self.iterations_to_converge > 0
```

---

### `backend/scoring/scorer.py`

```python
"""Trajectory Scorer — rates pipeline runs by outcome quality and execution efficiency.

Weights are configurable per-run. Default: 60% outcome, 40% efficiency.
All sub-scores are 0.0 to 1.0. Total score is weighted average.

This scorer is designed to later become an RL reward function via Agent Lightning.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .trajectory import DesignTrajectory

logger = logging.getLogger(__name__)


@dataclass
class ScoreBreakdown:
    """Transparent breakdown of how a trajectory was scored."""

    # Outcome scores (0-1)
    structural_score: float
    manufacturability_score: float
    mass_efficiency_score: float
    constraint_score: float

    # Efficiency scores (0-1)
    iteration_efficiency: float
    parallelism_score: float
    convergence_speed: float
    total_time_score: float

    # Weighted total
    total_score: float

    # Human-readable
    summary: str

    def to_dict(self) -> dict:
        return {
            "outcome": {
                "structural": round(self.structural_score, 3),
                "manufacturability": round(self.manufacturability_score, 3),
                "mass_efficiency": round(self.mass_efficiency_score, 3),
                "constraints": round(self.constraint_score, 3),
            },
            "efficiency": {
                "iterations": round(self.iteration_efficiency, 3),
                "parallelism": round(self.parallelism_score, 3),
                "convergence": round(self.convergence_speed, 3),
                "wall_clock": round(self.total_time_score, 3),
            },
            "total": round(self.total_score, 3),
            "summary": self.summary,
        }


class TrajectoryScorer:
    """Scores design trajectories by outcome quality AND execution efficiency."""

    def __init__(
        self,
        # Outcome weights (sum to 0.6 by default)
        w_structural: float = 0.20,
        w_manufacturability: float = 0.20,
        w_mass: float = 0.10,
        w_constraints: float = 0.10,
        # Efficiency weights (sum to 0.4 by default)
        w_iterations: float = 0.15,
        w_parallelism: float = 0.10,
        w_convergence: float = 0.10,
        w_time: float = 0.05,
        # Reference values for normalisation
        target_mass_g: float = 400.0,
        max_iterations: int = 15,
        max_time_ms: int = 60_000,
    ) -> None:
        self.weights = {
            "structural": w_structural,
            "manufacturability": w_manufacturability,
            "mass": w_mass,
            "constraints": w_constraints,
            "iterations": w_iterations,
            "parallelism": w_parallelism,
            "convergence": w_convergence,
            "time": w_time,
        }
        self.target_mass_g = target_mass_g
        self.max_iterations = max_iterations
        self.max_time_ms = max_time_ms

    def score(self, trajectory: DesignTrajectory) -> ScoreBreakdown:
        """Score a completed trajectory."""

        # --- Outcome scores ---

        # Structural: safety factor adequacy
        sf = trajectory.final_safety_factor
        if sf >= 2.0:
            structural = 1.0
        elif sf >= 1.5:
            structural = 0.5 + (sf - 1.5) / (2.0 - 1.5) * 0.5
        elif sf >= 1.0:
            structural = (sf - 1.0) / (1.5 - 1.0) * 0.5
        else:
            structural = 0.0

        # Manufacturability: direct from DFM score
        manufacturability = max(0.0, min(1.0, trajectory.final_dfm_score))

        # Mass efficiency: closer to target = better
        if self.target_mass_g > 0 and trajectory.final_mass_g > 0:
            mass_ratio = trajectory.final_mass_g / self.target_mass_g
            if mass_ratio <= 1.0:
                mass_efficiency = 1.0  # Under target is great
            elif mass_ratio <= 1.2:
                mass_efficiency = 1.0 - (mass_ratio - 1.0) / 0.2 * 0.5  # 0-20% over: 1.0→0.5
            elif mass_ratio <= 1.5:
                mass_efficiency = 0.5 - (mass_ratio - 1.2) / 0.3 * 0.5  # 20-50% over: 0.5→0.0
            else:
                mass_efficiency = 0.0
        else:
            mass_efficiency = 0.5

        # Constraint resolution
        total_constraints = trajectory.constraints_resolved + trajectory.constraints_remaining
        if total_constraints > 0:
            constraint_score = trajectory.constraints_resolved / total_constraints
        else:
            constraint_score = 1.0  # No constraints = perfect

        # --- Efficiency scores ---

        # Iteration efficiency: fewer = better
        iters = trajectory.total_iterations
        if iters <= 3:
            iteration_eff = 1.0
        elif iters <= 7:
            iteration_eff = 0.7 + (7 - iters) / 4 * 0.3
        elif iters <= self.max_iterations:
            iteration_eff = 0.3 * (1.0 - (iters - 7) / (self.max_iterations - 7))
        else:
            iteration_eff = 0.0

        # Parallelism: fraction of stages that ran in parallel
        if trajectory.total_stages > 0:
            parallelism = trajectory.parallel_stages / trajectory.total_stages
        else:
            parallelism = 0.0

        # Convergence speed
        if trajectory.did_converge:
            convergence = 1.0 - (trajectory.iterations_to_converge / self.max_iterations)
            convergence = max(0.0, convergence)
        else:
            convergence = 0.0

        # Wall-clock time
        if trajectory.total_wall_clock_ms > 0:
            time_ratio = trajectory.total_wall_clock_ms / self.max_time_ms
            time_score = max(0.0, 1.0 - time_ratio)
        else:
            time_score = 0.5

        # --- Weighted total ---
        total = (
            self.weights["structural"] * structural
            + self.weights["manufacturability"] * manufacturability
            + self.weights["mass"] * mass_efficiency
            + self.weights["constraints"] * constraint_score
            + self.weights["iterations"] * iteration_eff
            + self.weights["parallelism"] * parallelism
            + self.weights["convergence"] * convergence
            + self.weights["time"] * time_score
        )

        # --- Summary ---
        parts = []
        if structural >= 0.8:
            parts.append(f"structurally sound (SF={trajectory.final_safety_factor:.1f})")
        elif structural > 0:
            parts.append(f"marginal structure (SF={trajectory.final_safety_factor:.1f})")
        else:
            parts.append("structural failure")

        if trajectory.did_converge:
            parts.append(f"converged in {trajectory.iterations_to_converge} iterations")
        else:
            parts.append(f"did not converge after {trajectory.total_iterations} iterations")

        if trajectory.oscillation_events > 0:
            parts.append(f"{trajectory.oscillation_events} oscillation events")

        summary = "; ".join(parts)

        return ScoreBreakdown(
            structural_score=structural,
            manufacturability_score=manufacturability,
            mass_efficiency_score=mass_efficiency,
            constraint_score=constraint_score,
            iteration_efficiency=iteration_eff,
            parallelism_score=parallelism,
            convergence_speed=convergence,
            total_time_score=time_score,
            total_score=round(total, 4),
            summary=summary,
        )

    def compare(self, trajectories: list[DesignTrajectory]) -> list[tuple[DesignTrajectory, ScoreBreakdown]]:
        """Score and rank multiple trajectories. Returns sorted by total score descending."""
        scored = [(t, self.score(t)) for t in trajectories]
        scored.sort(key=lambda x: x[1].total_score, reverse=True)
        return scored
```

---

### `backend/tests/test_phase3.py`

```python
"""Tests for Phase 3: Trajectory Scoring.

Run with: pytest backend/tests/test_phase3.py -v
"""

from __future__ import annotations

import pytest

from backend.scoring.scorer import TrajectoryScorer
from backend.scoring.trajectory import DesignTrajectory, StageExecution


def _make_trajectory(**overrides) -> DesignTrajectory:
    """Create a default successful trajectory with optional overrides."""
    defaults = dict(
        run_id="test",
        total_iterations=5,
        iterations_to_converge=5,
        final_safety_factor=2.1,
        final_dfm_score=0.95,
        final_mass_g=420.0,
        constraints_resolved=3,
        constraints_remaining=0,
        total_wall_clock_ms=15000,
        total_agent_calls=15,
        stage_executions=[
            StageExecution(agent_id="mass_properties", iteration=0, started_at=0, completed_at=0, execution_ms=50, ran_parallel_with=["dfm_check"]),
            StageExecution(agent_id="dfm_check", iteration=0, started_at=0, completed_at=0, execution_ms=30, ran_parallel_with=["mass_properties"]),
            StageExecution(agent_id="structural_fea", iteration=0, started_at=0, completed_at=0, execution_ms=100, ran_parallel_with=[]),
        ],
    )
    defaults.update(overrides)
    return DesignTrajectory(**defaults)


class TestTrajectoryScorer:
    def test_perfect_run_scores_high(self):
        t = _make_trajectory(
            total_iterations=2,
            iterations_to_converge=2,
            final_safety_factor=2.5,
            final_dfm_score=1.0,
            final_mass_g=380.0,
            constraints_resolved=3,
            constraints_remaining=0,
        )
        scorer = TrajectoryScorer()
        score = scorer.score(t)
        assert score.total_score > 0.8
        assert score.structural_score == 1.0
        assert score.manufacturability_score == 1.0
        assert score.iteration_efficiency == 1.0

    def test_failed_convergence_scores_low(self):
        t = _make_trajectory(
            total_iterations=15,
            iterations_to_converge=0,  # Did not converge
            final_safety_factor=1.2,
            final_dfm_score=0.5,
            constraints_resolved=1,
            constraints_remaining=3,
        )
        scorer = TrajectoryScorer()
        score = scorer.score(t)
        assert score.total_score < 0.4
        assert score.convergence_speed == 0.0

    def test_structural_failure_scores_zero(self):
        t = _make_trajectory(final_safety_factor=0.8)
        scorer = TrajectoryScorer()
        score = scorer.score(t)
        assert score.structural_score == 0.0

    def test_compare_ranks_correctly(self):
        good = _make_trajectory(
            run_id="good",
            total_iterations=3,
            iterations_to_converge=3,
            final_safety_factor=2.2,
        )
        bad = _make_trajectory(
            run_id="bad",
            total_iterations=12,
            iterations_to_converge=12,
            final_safety_factor=1.6,
        )
        scorer = TrajectoryScorer()
        ranked = scorer.compare([bad, good])
        assert ranked[0][0].run_id == "good"
        assert ranked[1][0].run_id == "bad"

    def test_custom_weights(self):
        t = _make_trajectory(
            final_safety_factor=1.0,  # Barely passing
            final_dfm_score=1.0,  # Perfect DFM
        )
        # Weight DFM heavily, structural lightly
        scorer_dfm = TrajectoryScorer(w_structural=0.05, w_manufacturability=0.50)
        scorer_str = TrajectoryScorer(w_structural=0.50, w_manufacturability=0.05)

        score_dfm = scorer_dfm.score(t)
        score_str = scorer_str.score(t)

        # DFM-weighted should score higher (good DFM, bad structural)
        assert score_dfm.total_score > score_str.total_score

    def test_parallelism_detected(self):
        t = _make_trajectory()
        assert t.parallel_stages == 2  # mass_properties and dfm_check
        assert t.sequential_stages == 1  # structural_fea

    def test_score_breakdown_has_summary(self):
        t = _make_trajectory()
        scorer = TrajectoryScorer()
        score = scorer.score(t)
        assert "structurally sound" in score.summary
        assert "converged" in score.summary
```

---

### Verification

```bash
pytest backend/tests/test_phase3.py -v
```
