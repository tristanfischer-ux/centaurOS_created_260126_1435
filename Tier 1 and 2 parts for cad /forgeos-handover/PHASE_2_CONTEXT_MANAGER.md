# Phase 2: Context Manager

## What This Is

A stateful context compressor that sits between pipeline iterations. It keeps current parameters and active constraints, summarises history into compact decision records, detects parameter oscillation, applies dampening, and stores a full audit trail in Supabase for rollback.

## Why

By iteration 10 of a drone design loop, the context object is bloated with superseded FEA results, old parameter values, and stale reasoning traces. This degrades agent performance. The Context Manager controls what agents see while preserving everything for audit.

## Dependencies

Requires Phase 1 complete (uses models from `backend/gateway/models.py`).

## Files to Create

---

### `backend/gateway/context_manager.py`

```python
"""Context Manager — compresses state between design iterations.

Sits between iterations in the pipeline orchestrator. Controls what
downstream agents see while preserving full history for audit/rollback.

Key responsibilities:
1. Compress iteration results into minimal working context
2. Track parameter value trends for oscillation detection
3. Apply dampening to oscillating parameters
4. Store full audit trail for rollback
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .models import IterationResult, ParamModification

logger = logging.getLogger(__name__)


@dataclass
class DesignDecision:
    """Compressed record of a parameter change."""

    iteration: int
    timestamp: datetime
    param: str
    old_value: Any
    new_value: Any
    reason: str
    agent_id: str
    confidence: float


@dataclass
class CompressedContext:
    """What downstream agents see. Minimal but sufficient."""

    current_params: dict[str, Any]
    active_constraints: list[str]
    resolved_constraints: list[str]
    design_decisions: list[DesignDecision]
    iteration: int
    convergence_trend: dict[str, list[float]]  # param -> last N values


@dataclass
class FullAuditRecord:
    """Complete record of one iteration. Stored for rollback/debugging."""

    iteration: int
    timestamp: datetime
    params_before: dict[str, Any]
    params_after: dict[str, Any]
    raw_agent_responses: dict[str, Any]
    applied_modifications: list[dict[str, Any]]
    active_constraints: list[str]
    resolved_constraints: list[str]
    was_dampened: dict[str, bool]  # param -> whether dampening was applied


class ContextManager:
    """Manages context compression and oscillation detection between iterations."""

    def __init__(
        self,
        max_decision_history: int = 10,
        oscillation_window: int = 5,
        dampening_factor: float = 0.5,
    ) -> None:
        self.max_decision_history = max_decision_history
        self.oscillation_window = oscillation_window
        self.dampening_factor = dampening_factor

        self.audit_trail: list[FullAuditRecord] = []
        self.decision_history: list[DesignDecision] = []
        self.convergence_tracker: dict[str, list[float]] = defaultdict(list)
        self._all_constraints_resolved: list[str] = []

    def compress(
        self,
        current_params: dict[str, Any],
        iteration_result: IterationResult,
        iteration: int,
    ) -> CompressedContext:
        """Compress iteration results into minimal context for the next iteration.

        Rules:
        1. KEEP: current parameter values
        2. KEEP: active constraints (unresolved issues)
        3. SUMMARISE: modifications into DesignDecision records (capped at max_decision_history)
        4. DROP: raw agent analysis data (lives in audit trail only)
        5. TRACK: parameter values for oscillation detection
        """
        now = datetime.now(timezone.utc)

        # Record design decisions from this iteration's modifications
        for mod in iteration_result.modifications:
            decision = DesignDecision(
                iteration=iteration,
                timestamp=now,
                param=mod.param,
                old_value=mod.current,
                new_value=mod.proposed,
                reason=mod.reason,
                agent_id=mod.agent_id,
                confidence=mod.confidence,
            )
            self.decision_history.append(decision)

        # Trim to max history
        if len(self.decision_history) > self.max_decision_history:
            self.decision_history = self.decision_history[-self.max_decision_history :]

        # Track convergence trends
        for mod in iteration_result.modifications:
            val = mod.proposed
            if isinstance(val, (int, float)):
                self.convergence_tracker[mod.param].append(float(val))
                # Keep only the oscillation window
                if len(self.convergence_tracker[mod.param]) > self.oscillation_window:
                    self.convergence_tracker[mod.param] = self.convergence_tracker[mod.param][
                        -self.oscillation_window :
                    ]

        # Track resolved constraints across all iterations
        self._all_constraints_resolved.extend(iteration_result.constraints_resolved)

        # Build active constraints: start with existing, add new, remove resolved
        active = set(iteration_result.constraints_added)
        resolved = set(iteration_result.constraints_resolved)

        return CompressedContext(
            current_params=current_params,
            active_constraints=sorted(active - resolved),
            resolved_constraints=sorted(resolved),
            design_decisions=list(self.decision_history),
            iteration=iteration,
            convergence_trend=dict(self.convergence_tracker),
        )

    def detect_oscillation(self, param: str) -> bool:
        """Detect if a parameter is oscillating (A→B→A→B pattern).

        Checks the last N values in the convergence tracker.
        Oscillation = the value alternates direction at least 3 times.

        Example: [2.0, 3.0, 2.5, 3.2, 2.3] → directions: [+, -, +, -] → 3 direction changes → oscillating
        """
        values = self.convergence_tracker.get(param, [])
        if len(values) < 3:
            return False

        # Calculate direction changes
        directions = []
        for i in range(1, len(values)):
            diff = values[i] - values[i - 1]
            if abs(diff) > 1e-6:  # Ignore negligible changes
                directions.append(1 if diff > 0 else -1)

        if len(directions) < 2:
            return False

        # Count direction reversals
        reversals = sum(
            1 for i in range(1, len(directions)) if directions[i] != directions[i - 1]
        )

        is_oscillating = reversals >= 2
        if is_oscillating:
            logger.warning(
                f"Oscillation detected for '{param}': values={values}, "
                f"directions={directions}, reversals={reversals}"
            )
        return is_oscillating

    def apply_dampening(
        self,
        modifications: list[ParamModification],
        current_params: dict[str, Any],
    ) -> tuple[list[ParamModification], dict[str, bool]]:
        """Apply dampening to oscillating parameters.

        For each modification where the parameter is oscillating,
        reduce the change by dampening_factor (default 50%).

        Returns:
            Tuple of (dampened modifications, dict of which params were dampened)
        """
        dampened_flags: dict[str, bool] = {}

        for mod in modifications:
            if self.detect_oscillation(mod.param):
                current = current_params.get(mod.param)
                if current is not None and isinstance(mod.proposed, (int, float)) and isinstance(current, (int, float)):
                    original_proposed = mod.proposed
                    dampened_change = (mod.proposed - current) * self.dampening_factor
                    mod.proposed = round(current + dampened_change, 2)
                    mod.reason += f" [DAMPENED: {original_proposed}→{mod.proposed}, factor={self.dampening_factor}]"
                    dampened_flags[mod.param] = True
                    logger.info(
                        f"Dampened '{mod.param}': {original_proposed} → {mod.proposed} "
                        f"(factor={self.dampening_factor})"
                    )
                else:
                    dampened_flags[mod.param] = False
            else:
                dampened_flags[mod.param] = False

        return modifications, dampened_flags

    def store_audit(
        self,
        iteration: int,
        params_before: dict[str, Any],
        params_after: dict[str, Any],
        raw_responses: dict[str, Any],
        applied_mods: list[ParamModification],
        active_constraints: list[str],
        resolved_constraints: list[str],
        dampened_flags: dict[str, bool],
    ) -> None:
        """Store full uncompressed record for rollback/debugging."""
        record = FullAuditRecord(
            iteration=iteration,
            timestamp=datetime.now(timezone.utc),
            params_before=dict(params_before),
            params_after=dict(params_after),
            raw_agent_responses=dict(raw_responses),
            applied_modifications=[
                {
                    "param": m.param,
                    "current": m.current,
                    "proposed": m.proposed,
                    "reason": m.reason,
                    "agent_id": m.agent_id,
                    "confidence": m.confidence,
                }
                for m in applied_mods
            ],
            active_constraints=list(active_constraints),
            resolved_constraints=list(resolved_constraints),
            was_dampened=dict(dampened_flags),
        )
        self.audit_trail.append(record)

    def rollback_to(self, iteration: int) -> dict[str, Any] | None:
        """Restore full design state from a previous iteration.

        Returns params_after from the requested iteration, or None if not found.
        """
        for record in self.audit_trail:
            if record.iteration == iteration:
                return dict(record.params_after)
        return None

    def get_audit_summary(self) -> list[dict]:
        """Return a summary of all iterations for display/debugging."""
        return [
            {
                "iteration": r.iteration,
                "timestamp": r.timestamp.isoformat(),
                "num_modifications": len(r.applied_modifications),
                "active_constraints": len(r.active_constraints),
                "resolved_constraints": len(r.resolved_constraints),
                "dampened_params": [k for k, v in r.was_dampened.items() if v],
            }
            for r in self.audit_trail
        ]

    def reset(self) -> None:
        """Reset all state for a new pipeline run."""
        self.audit_trail.clear()
        self.decision_history.clear()
        self.convergence_tracker.clear()
        self._all_constraints_resolved.clear()
```

---

### `backend/tests/test_phase2.py`

```python
"""Tests for Phase 2: Context Manager.

Run with: pytest backend/tests/test_phase2.py -v
"""

from __future__ import annotations

import pytest

from backend.gateway.context_manager import ContextManager
from backend.gateway.models import IterationResult, ParamModification


def _make_iteration_result(
    modifications: list[ParamModification] | None = None,
    constraints_added: list[str] | None = None,
    constraints_resolved: list[str] | None = None,
) -> IterationResult:
    return IterationResult(
        run_id="test",
        iteration=0,
        modifications=modifications or [],
        analysis_results={},
        constraints_added=constraints_added or [],
        constraints_resolved=constraints_resolved or [],
        agent_execution_times={},
        agents_run=[],
        agents_skipped=[],
        total_time_ms=0,
    )


class TestContextCompression:
    def test_compress_keeps_current_params(self):
        cm = ContextManager()
        params = {"arm_thickness_mm": 3.0, "motor_spacing_mm": 220.0}
        result = _make_iteration_result()
        compressed = cm.compress(params, result, iteration=0)
        assert compressed.current_params == params

    def test_compress_records_decisions(self):
        cm = ContextManager()
        mod = ParamModification(
            param="arm_thickness_mm",
            current=2.0,
            proposed=3.0,
            reason="Stress exceeded yield",
            confidence=0.9,
            agent_id="structural_fea",
        )
        result = _make_iteration_result(modifications=[mod])
        compressed = cm.compress({"arm_thickness_mm": 3.0}, result, iteration=0)
        assert len(compressed.design_decisions) == 1
        assert compressed.design_decisions[0].param == "arm_thickness_mm"

    def test_compress_caps_history(self):
        cm = ContextManager(max_decision_history=3)
        for i in range(5):
            mod = ParamModification(
                param=f"param_{i}", current=i, proposed=i + 1,
                reason="test", confidence=0.5, agent_id="test",
            )
            result = _make_iteration_result(modifications=[mod])
            cm.compress({}, result, iteration=i)
        assert len(cm.decision_history) == 3
        # Should keep the last 3
        assert cm.decision_history[0].param == "param_2"


class TestOscillationDetection:
    def test_no_oscillation_with_few_values(self):
        cm = ContextManager()
        cm.convergence_tracker["thickness"] = [2.0, 3.0]
        assert cm.detect_oscillation("thickness") is False

    def test_detects_classic_oscillation(self):
        cm = ContextManager(oscillation_window=6)
        # Pattern: up, down, up, down — classic oscillation
        cm.convergence_tracker["thickness"] = [2.0, 3.0, 2.5, 3.2, 2.3]
        assert cm.detect_oscillation("thickness") is True

    def test_no_oscillation_with_monotonic_convergence(self):
        cm = ContextManager()
        # Steadily increasing — no oscillation
        cm.convergence_tracker["thickness"] = [2.0, 2.5, 2.8, 3.0, 3.1]
        assert cm.detect_oscillation("thickness") is False

    def test_no_oscillation_for_unknown_param(self):
        cm = ContextManager()
        assert cm.detect_oscillation("nonexistent") is False


class TestDampening:
    def test_dampens_oscillating_param(self):
        cm = ContextManager(dampening_factor=0.5, oscillation_window=6)
        cm.convergence_tracker["thickness"] = [2.0, 3.0, 2.5, 3.2, 2.3]

        mod = ParamModification(
            param="thickness", current=2.3, proposed=3.5,
            reason="stress", confidence=0.9, agent_id="test",
        )
        mods, flags = cm.apply_dampening([mod], {"thickness": 2.3})
        assert flags["thickness"] is True
        # Change was 3.5 - 2.3 = 1.2, dampened by 50% = 0.6, so proposed = 2.3 + 0.6 = 2.9
        assert mods[0].proposed == 2.9

    def test_does_not_dampen_non_oscillating(self):
        cm = ContextManager()
        cm.convergence_tracker["thickness"] = [2.0, 2.5, 3.0]  # Monotonic

        mod = ParamModification(
            param="thickness", current=3.0, proposed=3.5,
            reason="stress", confidence=0.9, agent_id="test",
        )
        mods, flags = cm.apply_dampening([mod], {"thickness": 3.0})
        assert flags["thickness"] is False
        assert mods[0].proposed == 3.5  # Unchanged


class TestAuditTrail:
    def test_store_and_rollback(self):
        cm = ContextManager()
        cm.store_audit(
            iteration=0,
            params_before={"thickness": 2.0},
            params_after={"thickness": 3.0},
            raw_responses={"structural_fea": {"safety_factor": 1.2}},
            applied_mods=[],
            active_constraints=["stress_high"],
            resolved_constraints=[],
            dampened_flags={},
        )
        cm.store_audit(
            iteration=1,
            params_before={"thickness": 3.0},
            params_after={"thickness": 3.5},
            raw_responses={"structural_fea": {"safety_factor": 1.8}},
            applied_mods=[],
            active_constraints=[],
            resolved_constraints=["stress_high"],
            dampened_flags={},
        )
        # Rollback to iteration 0
        params = cm.rollback_to(0)
        assert params == {"thickness": 3.0}

        # Rollback to iteration 1
        params = cm.rollback_to(1)
        assert params == {"thickness": 3.5}

        # Rollback to nonexistent iteration
        assert cm.rollback_to(99) is None

    def test_audit_summary(self):
        cm = ContextManager()
        cm.store_audit(
            iteration=0,
            params_before={},
            params_after={},
            raw_responses={},
            applied_mods=[],
            active_constraints=["a", "b"],
            resolved_constraints=["c"],
            dampened_flags={"thickness": True},
        )
        summary = cm.get_audit_summary()
        assert len(summary) == 1
        assert summary[0]["active_constraints"] == 2
        assert summary[0]["dampened_params"] == ["thickness"]
```

---

### Supabase Migration

Create `supabase/migrations/002_design_iterations.sql`:

```sql
-- Design iteration audit trail
-- Stores full state at each iteration for rollback and analysis

CREATE TABLE IF NOT EXISTS design_iterations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id UUID NOT NULL,
    iteration INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    params_before JSONB NOT NULL DEFAULT '{}',
    params_after JSONB NOT NULL DEFAULT '{}',
    agent_responses JSONB NOT NULL DEFAULT '{}',
    applied_modifications JSONB NOT NULL DEFAULT '[]',
    active_constraints TEXT[] DEFAULT '{}',
    resolved_constraints TEXT[] DEFAULT '{}',
    dampened_params TEXT[] DEFAULT '{}',
    convergence_metrics JSONB DEFAULT '{}',
    UNIQUE(run_id, iteration)
);

CREATE INDEX idx_design_iterations_run ON design_iterations(run_id, iteration);
CREATE INDEX idx_design_iterations_created ON design_iterations(created_at DESC);
```

---

### Verification

```bash
pytest backend/tests/test_phase2.py -v
```

All tests should pass, confirming:
- Compression keeps only current params + active constraints + last N decisions
- Oscillation detection catches A→B→A→B patterns
- Dampening reduces changes by 50% for oscillating params
- Audit trail stores full history and supports rollback
- Summary produces clean iteration overviews
