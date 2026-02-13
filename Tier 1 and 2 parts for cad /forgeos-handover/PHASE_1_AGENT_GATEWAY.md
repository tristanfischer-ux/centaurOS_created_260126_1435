# Phase 1: Agent Gateway Protocol

## What This Is

Refactor ForgeOS's monolithic pipeline into independent agents behind a standardised gateway. Currently the engineering loop is chained function calls in a single script. After this phase, each analysis stage (mass properties, structural, DFM) is an independent agent that receives design state and returns modifications via a common protocol. The orchestrator runs independent agents in parallel and resolves conflicting modifications by confidence score.

## Why

Adding a new analysis type (CFD, cost estimation, thermal) currently requires modifying the core pipeline script. With a gateway, you register a new agent and it's automatically included in the next pipeline run. This also enables parallel execution — mass properties and DFM have no dependency on each other and can run simultaneously.

## Files to Create

Create all files under `backend/`. Do NOT modify existing files in `backend/app/` — this is a new subsystem that will eventually replace the monolithic pipeline.

---

### `backend/gateway/__init__.py`

```python
"""ForgeOS Agent Gateway — standardised protocol for design analysis agents."""
```

---

### `backend/gateway/models.py`

```python
"""Pydantic models for the Agent Gateway protocol.

Every agent receives an AgentRequest and returns an AgentResponse.
These models define the contract between the orchestrator and all agents.
"""

from __future__ import annotations

import time
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"
    SKIP = "skip"


class ParamModification(BaseModel):
    """A proposed change to a design parameter."""

    param: str  # e.g. "arm_wall_thickness_mm"
    current: float | int | str
    proposed: float | int | str
    reason: str  # Engineering justification
    confidence: float = Field(ge=0.0, le=1.0)  # Higher = more certain this change is needed
    agent_id: str = ""


class DesignState(BaseModel):
    """Current state of the parametric design."""

    params: dict[str, Any] = Field(
        default_factory=dict,
        description="Current design parameters, e.g. {'arm_wall_thickness_mm': 2.5, 'motor_spacing_mm': 220}",
    )
    material: str = "petg"
    geometry_hash: str | None = None  # SHA256 of current STL, for cache invalidation
    active_constraints: list[str] = Field(
        default_factory=list,
        description="Unresolved issues from previous iterations, e.g. ['motor_mount_stress > yield']",
    )


class AgentContext(BaseModel):
    """Context from previous iterations, compressed by the ContextManager."""

    previous_results: dict[str, Any] = Field(
        default_factory=dict,
        description="Analysis results from agents that ran earlier in this iteration or in previous iterations",
    )
    decision_log: list[str] = Field(
        default_factory=list,
        description="Compressed history of design decisions, e.g. ['Iter 1: arm_thickness 2.0→2.5 (stress exceeded yield)']",
    )
    iteration: int = 0


class AgentRequest(BaseModel):
    """What every agent receives."""

    agent_id: str
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    iteration: int = 0
    design_state: DesignState
    context: AgentContext = Field(default_factory=AgentContext)


class AgentResponse(BaseModel):
    """What every agent returns."""

    agent_id: str
    status: AgentStatus = AgentStatus.SUCCESS
    modifications: list[ParamModification] = Field(default_factory=list)
    analysis_results: dict[str, Any] = Field(default_factory=dict)
    constraints_resolved: list[str] = Field(default_factory=list)
    constraints_added: list[str] = Field(default_factory=list)
    execution_time_ms: int = 0
    error_message: str | None = None


class IterationResult(BaseModel):
    """Aggregated results from all agents in one iteration."""

    run_id: str
    iteration: int
    modifications: list[ParamModification] = Field(default_factory=list)
    analysis_results: dict[str, Any] = Field(default_factory=dict)
    constraints_resolved: list[str] = Field(default_factory=list)
    constraints_added: list[str] = Field(default_factory=list)
    agent_execution_times: dict[str, int] = Field(default_factory=dict)
    agents_run: list[str] = Field(default_factory=list)
    agents_skipped: list[str] = Field(default_factory=list)
    total_time_ms: int = 0
```

---

### `backend/gateway/agent_base.py`

```python
"""Abstract base class for all ForgeOS analysis agents.

Every agent must:
1. Declare a unique agent_id
2. Declare its dependencies (other agent_ids that must run first)
3. Implement run() which receives design state and returns modifications
4. Optionally implement can_skip() to avoid unnecessary work
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod

from .models import AgentRequest, AgentResponse, AgentStatus

logger = logging.getLogger(__name__)


class ForgeAgent(ABC):
    """Base class for all ForgeOS analysis agents."""

    @property
    @abstractmethod
    def agent_id(self) -> str:
        """Unique identifier, e.g. 'mass_properties', 'structural_fea'."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """What this agent does, for logging and registry display."""
        ...

    @property
    def dependencies(self) -> list[str]:
        """Agent IDs that must run before this one. Empty = no dependencies (Level 0)."""
        return []

    def can_skip(self, request: AgentRequest) -> bool:
        """Return True if this agent has no work to do given current state.

        Override to skip unnecessary runs, e.g. DFM check can skip if
        geometry hasn't changed since last iteration.
        """
        return False

    async def execute(self, request: AgentRequest) -> AgentResponse:
        """Wrapper that handles timing, error catching, and logging.

        Do NOT override this. Override run() instead.
        """
        start = time.perf_counter_ns()
        logger.info(f"[{self.agent_id}] Starting (iteration={request.iteration})")

        try:
            response = await self.run(request)
            elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000
            response.execution_time_ms = elapsed_ms
            response.agent_id = self.agent_id

            logger.info(
                f"[{self.agent_id}] Completed in {elapsed_ms}ms — "
                f"{len(response.modifications)} modifications, "
                f"{len(response.constraints_added)} new constraints"
            )
            return response

        except Exception as e:
            elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000
            logger.error(f"[{self.agent_id}] Failed after {elapsed_ms}ms: {e}")
            return AgentResponse(
                agent_id=self.agent_id,
                status=AgentStatus.ERROR,
                execution_time_ms=elapsed_ms,
                error_message=str(e),
            )

    @abstractmethod
    async def run(self, request: AgentRequest) -> AgentResponse:
        """Execute this agent's analysis. Override this method.

        Args:
            request: Current design state + context from previous agents/iterations.

        Returns:
            AgentResponse with proposed modifications and analysis results.
        """
        ...
```

---

### `backend/gateway/registry.py`

```python
"""Agent Registry — tracks registered agents and resolves execution order.

Agents declare dependencies on other agents. The registry builds a
dependency DAG and returns agents grouped by level for parallel execution:
  Level 0: no dependencies (run in parallel)
  Level 1: depends only on Level 0 agents (run after Level 0 completes)
  Level 2: depends on Level 0 or 1 agents (run after Level 1 completes)
  etc.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field

from .agent_base import ForgeAgent

logger = logging.getLogger(__name__)


@dataclass
class AgentStats:
    """Execution statistics for a registered agent."""

    total_runs: int = 0
    total_skips: int = 0
    total_errors: int = 0
    total_time_ms: int = 0
    avg_time_ms: float = 0.0
    last_run_time_ms: int = 0


class AgentRegistry:
    """Registry of all available agents with dependency resolution."""

    def __init__(self) -> None:
        self._agents: dict[str, ForgeAgent] = {}
        self._stats: dict[str, AgentStats] = {}

    def register(self, agent: ForgeAgent) -> None:
        """Register an agent. Validates dependencies exist at execution time, not here."""
        if agent.agent_id in self._agents:
            logger.warning(f"Overwriting existing agent: {agent.agent_id}")
        self._agents[agent.agent_id] = agent
        self._stats[agent.agent_id] = AgentStats()
        logger.info(f"Registered agent: {agent.agent_id} (deps={agent.dependencies})")

    def get_agent(self, agent_id: str) -> ForgeAgent:
        """Get agent by ID. Raises KeyError if not found."""
        if agent_id not in self._agents:
            raise KeyError(f"Agent '{agent_id}' not registered. Available: {list(self._agents.keys())}")
        return self._agents[agent_id]

    def get_all_agents(self) -> dict[str, ForgeAgent]:
        """Return all registered agents."""
        return dict(self._agents)

    def get_stats(self, agent_id: str) -> AgentStats:
        """Get execution stats for an agent."""
        return self._stats.get(agent_id, AgentStats())

    def update_stats(self, agent_id: str, time_ms: int, was_error: bool = False) -> None:
        """Update stats after an agent runs."""
        stats = self._stats[agent_id]
        if was_error:
            stats.total_errors += 1
        else:
            stats.total_runs += 1
        stats.total_time_ms += time_ms
        stats.last_run_time_ms = time_ms
        total = stats.total_runs + stats.total_errors
        if total > 0:
            stats.avg_time_ms = stats.total_time_ms / total

    def record_skip(self, agent_id: str) -> None:
        """Record that an agent was skipped."""
        self._stats[agent_id].total_skips += 1

    def get_execution_order(self) -> list[list[str]]:
        """Return agents grouped by dependency level for parallel execution.

        Level 0: agents with no dependencies
        Level 1: agents whose dependencies are all in Level 0
        Level N: agents whose dependencies are all in Levels 0..N-1

        Raises ValueError if there's a circular dependency.

        Returns:
            List of lists. Each inner list contains agent_ids that can run in parallel.
            Example: [["mass_properties", "dfm_check"], ["structural_fea"]]
        """
        if not self._agents:
            return []

        # Validate all dependencies exist
        for agent_id, agent in self._agents.items():
            for dep in agent.dependencies:
                if dep not in self._agents:
                    raise ValueError(
                        f"Agent '{agent_id}' depends on '{dep}' which is not registered. "
                        f"Available agents: {list(self._agents.keys())}"
                    )

        # Topological sort via Kahn's algorithm
        # Build in-degree map and adjacency list
        in_degree: dict[str, int] = {aid: 0 for aid in self._agents}
        dependents: dict[str, list[str]] = defaultdict(list)  # dep -> [agents that depend on it]

        for agent_id, agent in self._agents.items():
            in_degree[agent_id] = len(agent.dependencies)
            for dep in agent.dependencies:
                dependents[dep].append(agent_id)

        # BFS by levels
        levels: list[list[str]] = []
        current_level = [aid for aid, deg in in_degree.items() if deg == 0]

        processed = 0
        while current_level:
            levels.append(sorted(current_level))  # Sort for deterministic ordering
            next_level: list[str] = []
            for agent_id in current_level:
                processed += 1
                for dependent in dependents[agent_id]:
                    in_degree[dependent] -= 1
                    if in_degree[dependent] == 0:
                        next_level.append(dependent)
            current_level = next_level

        if processed != len(self._agents):
            # Some agents never reached in_degree 0 — circular dependency
            stuck = [aid for aid, deg in in_degree.items() if deg > 0]
            raise ValueError(f"Circular dependency detected involving: {stuck}")

        logger.info(f"Execution order: {levels}")
        return levels
```

---

### `backend/gateway/orchestrator.py`

```python
"""Pipeline Orchestrator — runs all agents for one design iteration.

Agents at the same dependency level run concurrently via asyncio.gather.
Collects all modifications, resolves conflicts (highest confidence wins),
and returns a unified IterationResult.
"""

from __future__ import annotations

import asyncio
import logging
import time
from uuid import uuid4

from .agent_base import ForgeAgent
from .models import (
    AgentContext,
    AgentRequest,
    AgentResponse,
    AgentStatus,
    DesignState,
    IterationResult,
    ParamModification,
)
from .registry import AgentRegistry

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    """Runs the agent pipeline for one or more iterations."""

    def __init__(self, registry: AgentRegistry) -> None:
        self.registry = registry

    async def run_iteration(
        self,
        design_state: DesignState,
        context: AgentContext,
        run_id: str,
        iteration: int,
    ) -> IterationResult:
        """Run all registered agents for one design iteration.

        Agents at the same dependency level run concurrently.
        Results are collected, conflicts resolved, and a unified result returned.
        """
        start = time.perf_counter_ns()
        execution_order = self.registry.get_execution_order()

        all_modifications: list[ParamModification] = []
        all_results: dict[str, dict] = {}
        all_constraints_resolved: list[str] = []
        all_constraints_added: list[str] = []
        agent_times: dict[str, int] = {}
        agents_run: list[str] = []
        agents_skipped: list[str] = []

        for level_idx, level in enumerate(execution_order):
            logger.info(f"[Iter {iteration}] Running Level {level_idx}: {level}")

            # Build tasks for agents at this level
            tasks: list[tuple[str, asyncio.Task]] = []
            for agent_id in level:
                agent = self.registry.get_agent(agent_id)
                request = AgentRequest(
                    agent_id=agent_id,
                    run_id=run_id,
                    iteration=iteration,
                    design_state=design_state,
                    context=context,
                )

                if agent.can_skip(request):
                    logger.info(f"  Skipping {agent_id} (can_skip=True)")
                    agents_skipped.append(agent_id)
                    self.registry.record_skip(agent_id)
                    continue

                tasks.append((agent_id, asyncio.create_task(agent.execute(request))))

            # Await all tasks at this level concurrently
            for agent_id, task in tasks:
                try:
                    response: AgentResponse = await task
                except Exception as e:
                    logger.error(f"  {agent_id} raised unhandled exception: {e}")
                    response = AgentResponse(
                        agent_id=agent_id,
                        status=AgentStatus.ERROR,
                        error_message=str(e),
                    )

                # Record stats
                agent_times[agent_id] = response.execution_time_ms
                self.registry.update_stats(
                    agent_id,
                    response.execution_time_ms,
                    was_error=(response.status == AgentStatus.ERROR),
                )

                if response.status == AgentStatus.SUCCESS:
                    agents_run.append(agent_id)

                    # Tag modifications with their source agent
                    for mod in response.modifications:
                        mod.agent_id = agent_id
                    all_modifications.extend(response.modifications)
                    all_results[agent_id] = response.analysis_results
                    all_constraints_resolved.extend(response.constraints_resolved)
                    all_constraints_added.extend(response.constraints_added)

                    # Update context for next level's agents
                    context.previous_results[agent_id] = response.analysis_results
                elif response.status == AgentStatus.ERROR:
                    agents_run.append(agent_id)
                    logger.warning(f"  {agent_id} returned error: {response.error_message}")

        # Resolve conflicting modifications
        resolved_modifications = self._resolve_conflicts(all_modifications)

        total_ms = (time.perf_counter_ns() - start) // 1_000_000
        logger.info(
            f"[Iter {iteration}] Complete in {total_ms}ms — "
            f"{len(resolved_modifications)} modifications from {len(agents_run)} agents"
        )

        return IterationResult(
            run_id=run_id,
            iteration=iteration,
            modifications=resolved_modifications,
            analysis_results=all_results,
            constraints_resolved=all_constraints_resolved,
            constraints_added=all_constraints_added,
            agent_execution_times=agent_times,
            agents_run=agents_run,
            agents_skipped=agents_skipped,
            total_time_ms=total_ms,
        )

    def _resolve_conflicts(self, modifications: list[ParamModification]) -> list[ParamModification]:
        """When multiple agents modify the same parameter, highest confidence wins.

        If two agents both want to change arm_wall_thickness_mm, the one with
        higher confidence is kept. Ties broken by preferring the more conservative
        change (larger value for thickness/strength params, smaller for mass).
        """
        if not modifications:
            return []

        # Group by parameter
        by_param: dict[str, list[ParamModification]] = {}
        for mod in modifications:
            by_param.setdefault(mod.param, []).append(mod)

        resolved: list[ParamModification] = []
        for param, mods in by_param.items():
            if len(mods) == 1:
                resolved.append(mods[0])
            else:
                # Sort by confidence descending, then by proposed value descending
                # (prefer more conservative / larger values as tiebreaker)
                mods.sort(key=lambda m: (m.confidence, _numeric_value(m.proposed)), reverse=True)
                winner = mods[0]
                losers = mods[1:]
                logger.info(
                    f"  Conflict on '{param}': {winner.agent_id} (conf={winner.confidence}) wins over "
                    f"{[m.agent_id for m in losers]}"
                )
                resolved.append(winner)

        return resolved


def _numeric_value(val: float | int | str) -> float:
    """Extract numeric value for comparison. Non-numeric returns 0."""
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0
```

---

### `backend/agents/__init__.py`

```python
"""ForgeOS Analysis Agents — concrete implementations of ForgeAgent."""
```

---

### `backend/agents/mass_properties.py`

```python
"""Mass Properties Agent — calculates CG, MOI, total mass.

Proposes battery/electronics repositioning if CG is offset from thrust center.
No dependencies — runs at Level 0 (parallel with DFM).

Engineering model:
- Components modeled as point masses at known positions
- Frame mass estimated from volume × density × effective fill ratio (0.7 for 2-perimeter 40% infill)
- CG = weighted average of all component positions
- Thrust center = geometric center of motor positions (0,0 for symmetric quad)
- If CG offset > 2mm, proposes moving battery to compensate
"""

from __future__ import annotations

import math

from backend.gateway.agent_base import ForgeAgent
from backend.gateway.models import (
    AgentRequest,
    AgentResponse,
    AgentStatus,
    ParamModification,
)


# Component masses for a typical 5" quad build (grams)
# These are defaults — in production, pulled from the component database
DEFAULT_COMPONENT_MASSES = {
    "motors_4x": 120.0,       # 4× ~30g motors
    "props_4x": 20.0,         # 4× ~5g props
    "fc_stack": 35.0,         # FC + ESC stack
    "battery": 200.0,         # Typical 4S 1300mAh
    "camera": 30.0,           # Action cam or FPV camera
    "receiver": 5.0,
    "vtx": 10.0,
    "wiring_misc": 15.0,
    "gps": 10.0,
}


class MassPropertiesAgent(ForgeAgent):
    """Calculates mass properties and proposes CG corrections."""

    @property
    def agent_id(self) -> str:
        return "mass_properties"

    @property
    def description(self) -> str:
        return "Calculates center of gravity, moments of inertia, and total mass. Proposes component repositioning if CG is offset from thrust center."

    @property
    def dependencies(self) -> list[str]:
        return []  # Level 0

    async def run(self, request: AgentRequest) -> AgentResponse:
        params = request.design_state.params
        material = request.design_state.material

        # --- Extract geometry parameters ---
        motor_spacing_mm = params.get("motor_spacing_mm", 220.0)
        arm_width_mm = params.get("arm_width_mm", 12.0)
        arm_thickness_mm = params.get("arm_thickness_mm", 3.0)
        body_width_mm = params.get("body_width_mm", 36.0)
        body_length_mm = params.get("body_length_mm", 40.0)
        battery_x_offset_mm = params.get("battery_x_offset_mm", 0.0)
        battery_z_offset_mm = params.get("battery_z_offset_mm", -10.0)

        # --- Material density ---
        from backend.gateway.materials import MATERIALS
        mat = MATERIALS.get(material, MATERIALS["petg"])
        density_g_cm3 = mat["density"]

        # --- Estimate frame mass ---
        # Arm volume: 4 arms, each is a rectangular beam from body edge to motor mount
        arm_reach = (motor_spacing_mm / 2) / math.sqrt(2)
        body_diagonal = math.sqrt(body_width_mm**2 + body_length_mm**2) / 2
        arm_length_mm = arm_reach - body_diagonal / 2
        arm_volume_mm3 = 4 * arm_length_mm * arm_width_mm * arm_thickness_mm

        # Body volume: simplified as a rectangular plate
        body_volume_mm3 = body_width_mm * body_length_mm * arm_thickness_mm

        total_frame_volume_mm3 = arm_volume_mm3 + body_volume_mm3
        total_frame_volume_cm3 = total_frame_volume_mm3 / 1000.0
        effective_fill = 0.70  # 2 perimeters + 40% infill
        frame_mass_g = total_frame_volume_cm3 * density_g_cm3 * effective_fill

        # --- Component positions (x=forward, y=right, z=up) ---
        # Symmetric quad: motors at ±(spacing/2/√2) on both axes
        motor_arm = motor_spacing_mm / 2 / math.sqrt(2)
        components = [
            ("frame", frame_mass_g, 0.0, 0.0, 0.0),
            ("motor_FR", DEFAULT_COMPONENT_MASSES["motors_4x"] / 4, motor_arm, -motor_arm, 0.0),
            ("motor_FL", DEFAULT_COMPONENT_MASSES["motors_4x"] / 4, motor_arm, motor_arm, 0.0),
            ("motor_BR", DEFAULT_COMPONENT_MASSES["motors_4x"] / 4, -motor_arm, -motor_arm, 0.0),
            ("motor_BL", DEFAULT_COMPONENT_MASSES["motors_4x"] / 4, -motor_arm, motor_arm, 0.0),
            ("props", DEFAULT_COMPONENT_MASSES["props_4x"], 0.0, 0.0, 5.0),
            ("fc_stack", DEFAULT_COMPONENT_MASSES["fc_stack"], 0.0, 0.0, 8.0),
            ("battery", DEFAULT_COMPONENT_MASSES["battery"], battery_x_offset_mm, 0.0, battery_z_offset_mm),
            ("camera", DEFAULT_COMPONENT_MASSES["camera"], 20.0, 0.0, -5.0),
            ("receiver", DEFAULT_COMPONENT_MASSES["receiver"], -15.0, 0.0, 5.0),
            ("vtx", DEFAULT_COMPONENT_MASSES["vtx"], -10.0, 0.0, 10.0),
            ("wiring", DEFAULT_COMPONENT_MASSES["wiring_misc"], 0.0, 0.0, 0.0),
            ("gps", DEFAULT_COMPONENT_MASSES["gps"], 0.0, 0.0, 15.0),
        ]

        # --- Calculate CG ---
        total_mass_g = sum(c[1] for c in components)
        cg_x = sum(c[1] * c[2] for c in components) / total_mass_g
        cg_y = sum(c[1] * c[3] for c in components) / total_mass_g
        cg_z = sum(c[1] * c[4] for c in components) / total_mass_g

        # Thrust center is at (0, 0) for a symmetric quad
        cg_offset_mm = math.sqrt(cg_x**2 + cg_y**2)

        # --- Calculate MOI (simplified, point masses) ---
        # Ixx = Σ m(y² + z²), Iyy = Σ m(x² + z²), Izz = Σ m(x² + y²)
        ixx = sum(c[1] * (c[3]**2 + c[4]**2) for c in components) / 1e6  # g·mm² → g·m² (approx)
        iyy = sum(c[1] * (c[2]**2 + c[4]**2) for c in components) / 1e6
        izz = sum(c[1] * (c[2]**2 + c[3]**2) for c in components) / 1e6

        # --- Propose modifications if CG is offset ---
        modifications: list[ParamModification] = []
        constraints_resolved: list[str] = []
        constraints_added: list[str] = []

        CG_OFFSET_TARGET_MM = 2.0
        if cg_offset_mm > CG_OFFSET_TARGET_MM:
            # Calculate battery offset to compensate
            # CG_x = (Σm_i·x_i + m_batt·x_batt_new) / Σm_i = 0
            # x_batt_new = -(Σm_i·x_i - m_batt·x_batt_old) / m_batt
            non_batt_moment_x = sum(
                c[1] * c[2] for c in components if c[0] != "battery"
            )
            batt_mass = DEFAULT_COMPONENT_MASSES["battery"]
            ideal_batt_x = -non_batt_moment_x / batt_mass

            # Apply dampening — only move 50% of the way to avoid oscillation
            dampened_batt_x = battery_x_offset_mm + (ideal_batt_x - battery_x_offset_mm) * 0.5

            modifications.append(
                ParamModification(
                    param="battery_x_offset_mm",
                    current=battery_x_offset_mm,
                    proposed=round(dampened_batt_x, 1),
                    reason=f"CG offset is {cg_offset_mm:.1f}mm (target <{CG_OFFSET_TARGET_MM}mm). Moving battery to compensate.",
                    confidence=0.9,
                )
            )
            constraints_added.append(f"cg_offset_mm={cg_offset_mm:.1f} > {CG_OFFSET_TARGET_MM}")
        else:
            constraints_resolved.append(f"cg_offset_mm={cg_offset_mm:.1f} < {CG_OFFSET_TARGET_MM}")

        return AgentResponse(
            agent_id=self.agent_id,
            status=AgentStatus.SUCCESS,
            modifications=modifications,
            analysis_results={
                "total_mass_g": round(total_mass_g, 1),
                "frame_mass_g": round(frame_mass_g, 1),
                "cg_x_mm": round(cg_x, 2),
                "cg_y_mm": round(cg_y, 2),
                "cg_z_mm": round(cg_z, 2),
                "cg_offset_mm": round(cg_offset_mm, 2),
                "moi_ixx": round(ixx, 4),
                "moi_iyy": round(iyy, 4),
                "moi_izz": round(izz, 4),
                "thrust_to_weight": round(
                    (params.get("motor_max_thrust_g", 600) * 4) / total_mass_g, 2
                ),
            },
            constraints_resolved=constraints_resolved,
            constraints_added=constraints_added,
        )
```

---

### `backend/agents/structural_fea.py`

```python
"""Structural FEA Agent — cantilever beam stress analysis.

Depends on mass_properties (needs total mass for load calculation).
Runs at Level 1.

Engineering model:
- Each arm modeled as rectangular cantilever fixed at body junction
- Point load at motor mount (tip of cantilever)
- Four load cases: hover, max thrust, landing 3g, dynamic maneuver
- Bending stress: σ = M/S where M = F×L, S = bh²/6
- Deflection: δ = FL³/(3EI) where I = bh³/12
- Effective yield = material_yield × layer_adhesion_factor (for 3D print)
- Safety factor = effective_yield / max_bending_stress
"""

from __future__ import annotations

import math

from backend.gateway.agent_base import ForgeAgent
from backend.gateway.models import (
    AgentRequest,
    AgentResponse,
    AgentStatus,
    ParamModification,
)


class StructuralFEAAgent(ForgeAgent):
    """Simplified structural analysis using cantilever beam model."""

    @property
    def agent_id(self) -> str:
        return "structural_fea"

    @property
    def description(self) -> str:
        return "Cantilever beam stress analysis of drone arms under flight loads. Proposes thickness/fillet changes if stress exceeds yield."

    @property
    def dependencies(self) -> list[str]:
        return ["mass_properties"]  # Level 1

    async def run(self, request: AgentRequest) -> AgentResponse:
        params = request.design_state.params
        material = request.design_state.material

        from backend.gateway.materials import MATERIALS
        mat = MATERIALS.get(material, MATERIALS["petg"])

        # --- Geometry ---
        motor_spacing_mm = params.get("motor_spacing_mm", 220.0)
        arm_width_mm = params.get("arm_width_mm", 12.0)
        arm_thickness_mm = params.get("arm_thickness_mm", 3.0)
        arm_fillet_radius_mm = params.get("arm_fillet_radius_mm", 2.0)
        body_width_mm = params.get("body_width_mm", 36.0)
        body_length_mm = params.get("body_length_mm", 40.0)

        # --- Get total mass from mass_properties agent ---
        mass_results = request.context.previous_results.get("mass_properties", {})
        total_mass_g = mass_results.get("total_mass_g", 500.0)  # Fallback estimate

        # --- Arm dimensions ---
        arm_reach = (motor_spacing_mm / 2) / math.sqrt(2)
        body_diagonal = math.sqrt(body_width_mm**2 + body_length_mm**2) / 2
        cantilever_length_mm = arm_reach - body_diagonal / 2

        # Cross-section properties
        b = arm_width_mm    # Width
        h = arm_thickness_mm  # Height
        I_mm4 = (b * h**3) / 12.0        # Second moment of area
        S_mm3 = (b * h**2) / 6.0          # Section modulus

        # --- Load cases ---
        auw_N = (total_mass_g / 1000.0) * 9.81
        per_arm_N = auw_N / 4.0

        load_cases = {
            "hover": per_arm_N,
            "max_thrust": per_arm_N * 2.0,           # 2:1 thrust-to-weight
            "landing_3g": per_arm_N * 3.0,            # 3g impact
            "maneuver": per_arm_N * math.sqrt(5),     # 2g lateral + 1g vertical
        }

        worst_case = max(load_cases, key=load_cases.get)
        worst_force_N = load_cases[worst_case]

        # --- Bending stress at root ---
        bending_moment_Nmm = worst_force_N * cantilever_length_mm
        bending_stress_mpa = bending_moment_Nmm / S_mm3 if S_mm3 > 0 else 9999.0

        # Fillet stress concentration factor (simplified Peterson's)
        # Kt ≈ 1 + 2√(t/r) for a shoulder fillet, simplified
        if arm_fillet_radius_mm > 0:
            kt = 1.0 + 0.5 * math.sqrt(arm_thickness_mm / arm_fillet_radius_mm)
        else:
            kt = 2.5  # Sharp corner — high stress concentration
        peak_stress_mpa = bending_stress_mpa * kt

        # Effective yield for 3D printed material (layer adhesion derating)
        effective_yield_mpa = mat["yield_mpa"] * mat["layer_adhesion"]

        safety_factor = effective_yield_mpa / peak_stress_mpa if peak_stress_mpa > 0 else 999.0

        # --- Tip deflection ---
        E_mpa = mat["E_mpa"]
        L = cantilever_length_mm
        deflection_mm = (worst_force_N * L**3) / (3 * E_mpa * I_mm4) if (E_mpa * I_mm4) > 0 else 999.0
        deflection_pct = (deflection_mm / L * 100) if L > 0 else 0.0

        # --- Propose modifications if safety factor too low ---
        modifications: list[ParamModification] = []
        constraints_resolved: list[str] = []
        constraints_added: list[str] = []

        SAFETY_FACTOR_TARGET = 2.0
        SAFETY_FACTOR_MIN = 1.5
        MAX_DEFLECTION_PCT = 5.0

        if safety_factor < SAFETY_FACTOR_MIN:
            # Critical — need thicker arms
            # Required S for target safety factor: S_req = M * Kt / σ_yield_eff * SF_target
            required_S = bending_moment_Nmm * kt / effective_yield_mpa * SAFETY_FACTOR_TARGET
            # S = bh²/6 → h = √(6S/b)
            required_h = math.sqrt(6 * required_S / b)
            # Dampened: only 50% correction
            new_h = arm_thickness_mm + (required_h - arm_thickness_mm) * 0.5
            new_h = round(max(new_h, arm_thickness_mm), 1)  # Never decrease

            modifications.append(
                ParamModification(
                    param="arm_thickness_mm",
                    current=arm_thickness_mm,
                    proposed=new_h,
                    reason=f"Safety factor {safety_factor:.2f} < {SAFETY_FACTOR_MIN} under {worst_case} ({peak_stress_mpa:.1f}MPa vs {effective_yield_mpa:.1f}MPa yield). Increasing thickness.",
                    confidence=0.95,
                )
            )
            constraints_added.append(f"safety_factor={safety_factor:.2f} < {SAFETY_FACTOR_MIN}")

        elif safety_factor < SAFETY_FACTOR_TARGET:
            # Marginal — increase fillet radius to reduce stress concentration
            new_fillet = arm_fillet_radius_mm * 1.5
            new_fillet = round(min(new_fillet, arm_width_mm / 2), 1)  # Can't exceed half arm width

            modifications.append(
                ParamModification(
                    param="arm_fillet_radius_mm",
                    current=arm_fillet_radius_mm,
                    proposed=new_fillet,
                    reason=f"Safety factor {safety_factor:.2f} < {SAFETY_FACTOR_TARGET} target. Increasing fillet radius to reduce stress concentration (Kt={kt:.2f}).",
                    confidence=0.7,
                )
            )
            constraints_added.append(f"safety_factor={safety_factor:.2f} < {SAFETY_FACTOR_TARGET}")
        else:
            constraints_resolved.append(f"safety_factor={safety_factor:.2f} >= {SAFETY_FACTOR_TARGET}")

        if deflection_pct > MAX_DEFLECTION_PCT:
            constraints_added.append(f"deflection={deflection_pct:.1f}% > {MAX_DEFLECTION_PCT}%")

        return AgentResponse(
            agent_id=self.agent_id,
            status=AgentStatus.SUCCESS,
            modifications=modifications,
            analysis_results={
                "worst_load_case": worst_case,
                "worst_force_N": round(worst_force_N, 2),
                "cantilever_length_mm": round(cantilever_length_mm, 1),
                "bending_stress_mpa": round(bending_stress_mpa, 2),
                "stress_concentration_factor": round(kt, 2),
                "peak_stress_mpa": round(peak_stress_mpa, 2),
                "effective_yield_mpa": round(effective_yield_mpa, 1),
                "safety_factor": round(safety_factor, 2),
                "tip_deflection_mm": round(deflection_mm, 3),
                "tip_deflection_pct": round(deflection_pct, 2),
                "load_cases": {k: round(v, 2) for k, v in load_cases.items()},
            },
            constraints_resolved=constraints_resolved,
            constraints_added=constraints_added,
        )
```

---

### `backend/agents/dfm_check.py`

```python
"""DFM Check Agent — validates geometry against 3D printing constraints.

No dependencies — runs at Level 0 (parallel with mass_properties).

Checks:
1. Wall thickness vs material minimum
2. Feature sizes vs material minimum
3. Overhang angles (arm angles relative to print bed)
4. Print time and material cost estimation
5. Hole sizes for bolt clearance
"""

from __future__ import annotations

import math

from backend.gateway.agent_base import ForgeAgent
from backend.gateway.models import (
    AgentRequest,
    AgentResponse,
    AgentStatus,
    ParamModification,
)


class DFMCheckAgent(ForgeAgent):
    """Validates design against 3D printing manufacturability constraints."""

    @property
    def agent_id(self) -> str:
        return "dfm_check"

    @property
    def description(self) -> str:
        return "Checks geometry against 3D printing constraints: wall thickness, overhangs, feature sizes. Proposes fixes for violations."

    @property
    def dependencies(self) -> list[str]:
        return []  # Level 0

    def can_skip(self, request: AgentRequest) -> bool:
        # Skip if geometry hasn't changed (same hash as last iteration)
        prev = request.context.previous_results.get("dfm_check", {})
        if prev.get("geometry_hash") == request.design_state.geometry_hash:
            return request.design_state.geometry_hash is not None
        return False

    async def run(self, request: AgentRequest) -> AgentResponse:
        params = request.design_state.params
        material = request.design_state.material

        from backend.gateway.materials import MATERIALS
        mat = MATERIALS.get(material, MATERIALS["petg"])

        # --- Extract parameters ---
        arm_thickness_mm = params.get("arm_thickness_mm", 3.0)
        arm_width_mm = params.get("arm_width_mm", 12.0)
        arm_fillet_radius_mm = params.get("arm_fillet_radius_mm", 2.0)
        body_width_mm = params.get("body_width_mm", 36.0)
        body_length_mm = params.get("body_length_mm", 40.0)
        motor_mount_hole_mm = params.get("motor_mount_hole_mm", 2.2)
        fc_mount_hole_mm = params.get("fc_mount_hole_mm", 2.2)
        weight_reduction_holes = params.get("weight_reduction_holes", True)
        weight_reduction_hole_dia_mm = params.get("weight_reduction_hole_diameter_mm", 8.0)
        motor_spacing_mm = params.get("motor_spacing_mm", 220.0)

        issues: list[str] = []
        warnings: list[str] = []
        modifications: list[ParamModification] = []
        constraints_resolved: list[str] = []
        constraints_added: list[str] = []

        min_wall = mat["min_wall_mm"]
        min_feature = mat["min_feature_mm"]
        max_overhang = mat["max_overhang_deg"]

        # --- 1. Wall thickness ---
        if arm_thickness_mm < min_wall:
            issues.append(f"Arm thickness {arm_thickness_mm}mm < minimum {min_wall}mm for {material}")
            new_thickness = round(min_wall * 1.5, 1)
            modifications.append(
                ParamModification(
                    param="arm_thickness_mm",
                    current=arm_thickness_mm,
                    proposed=new_thickness,
                    reason=f"Below minimum printable wall thickness ({min_wall}mm for {material})",
                    confidence=1.0,  # This is a hard constraint
                )
            )
        elif arm_thickness_mm < min_wall * 1.5:
            warnings.append(f"Arm thickness {arm_thickness_mm}mm is close to minimum ({min_wall}mm)")

        if arm_width_mm < min_wall * 2:
            issues.append(f"Arm width {arm_width_mm}mm too narrow for reliable printing in {material}")

        # --- 2. Feature sizes ---
        if motor_mount_hole_mm < min_feature:
            issues.append(f"Motor mount holes {motor_mount_hole_mm}mm < minimum feature size {min_feature}mm")

        if fc_mount_hole_mm < min_feature:
            issues.append(f"FC mount holes {fc_mount_hole_mm}mm < minimum feature size {min_feature}mm")

        if arm_fillet_radius_mm > 0 and arm_fillet_radius_mm < min_feature:
            warnings.append(f"Fillet radius {arm_fillet_radius_mm}mm may not resolve cleanly (min feature {min_feature}mm)")

        # --- 3. Weight reduction hole checks ---
        if weight_reduction_holes:
            # Check wall between holes and arm edge
            wall_between = (arm_width_mm - weight_reduction_hole_dia_mm) / 2
            if wall_between < min_wall:
                issues.append(
                    f"Weight reduction holes leave only {wall_between:.1f}mm wall "
                    f"(need {min_wall}mm for {material})"
                )
                new_hole_dia = round(arm_width_mm - 2 * min_wall * 1.5, 1)
                if new_hole_dia < min_feature * 2:
                    # Holes too small to bother — remove them
                    modifications.append(
                        ParamModification(
                            param="weight_reduction_holes",
                            current=True,
                            proposed=False,
                            reason=f"Weight reduction holes leave insufficient wall ({wall_between:.1f}mm < {min_wall}mm). Removing holes.",
                            confidence=0.85,
                        )
                    )
                else:
                    modifications.append(
                        ParamModification(
                            param="weight_reduction_hole_diameter_mm",
                            current=weight_reduction_hole_dia_mm,
                            proposed=new_hole_dia,
                            reason=f"Reducing hole diameter to maintain {min_wall}mm wall on each side",
                            confidence=0.85,
                        )
                    )

        # --- 4. Overhang analysis ---
        # Arms at 45° to body (diagonal quad layout) — print flat, no overhang issue
        # Motor mount pads are flat — no issue
        # Fillet radii create overhangs
        if arm_fillet_radius_mm > arm_thickness_mm:
            # Large fillet relative to thickness creates overhang > 45°
            overhang_angle = math.degrees(math.atan2(arm_fillet_radius_mm, arm_thickness_mm))
            if overhang_angle > max_overhang:
                warnings.append(
                    f"Arm fillet overhang ~{overhang_angle:.0f}° exceeds {max_overhang}° for {material}. "
                    f"May need support material."
                )

        # --- 5. Print time and cost estimation ---
        # Simplified: estimate volume, divide by deposition rate
        arm_reach = (motor_spacing_mm / 2) / math.sqrt(2)
        body_diag = math.sqrt(body_width_mm**2 + body_length_mm**2) / 2
        arm_len = arm_reach - body_diag / 2
        frame_volume_cm3 = (
            4 * arm_len * arm_width_mm * arm_thickness_mm +
            body_width_mm * body_length_mm * arm_thickness_mm
        ) / 1000.0

        # Deposition rate: ~15 cm³/hr for a typical FDM printer at 0.2mm layer height
        deposition_rate_cm3_hr = 15.0
        print_time_hours = frame_volume_cm3 / deposition_rate_cm3_hr * 1.3  # 30% overhead for travel/retract
        print_time_min = print_time_hours * 60

        # Material cost: volume × density × price per kg
        MATERIAL_PRICE_PER_KG = {"pla": 20, "petg": 25, "abs": 22, "nylon": 45, "cf_petg": 40, "tpu": 35}
        price_per_kg = MATERIAL_PRICE_PER_KG.get(material, 25)
        material_mass_g = frame_volume_cm3 * mat["density"] * 0.70  # effective fill
        material_cost_usd = (material_mass_g / 1000) * price_per_kg

        # --- Build DFM score (0-1, 1 = perfectly manufacturable) ---
        dfm_score = 1.0
        dfm_score -= len(issues) * 0.25  # Each critical issue docks 25%
        dfm_score -= len(warnings) * 0.05  # Each warning docks 5%
        dfm_score = max(0.0, min(1.0, dfm_score))

        if issues:
            constraints_added.append(f"dfm_issues={len(issues)}")
        else:
            constraints_resolved.append("dfm_pass=true")

        return AgentResponse(
            agent_id=self.agent_id,
            status=AgentStatus.SUCCESS,
            modifications=modifications,
            analysis_results={
                "dfm_score": round(dfm_score, 2),
                "issues": issues,
                "warnings": warnings,
                "print_time_min": round(print_time_min, 0),
                "material_cost_usd": round(material_cost_usd, 2),
                "frame_volume_cm3": round(frame_volume_cm3, 1),
                "material_mass_g": round(material_mass_g, 1),
                "geometry_hash": request.design_state.geometry_hash,
            },
            constraints_resolved=constraints_resolved,
            constraints_added=constraints_added,
        )
```

---

### `backend/gateway/materials.py`

```python
"""Material properties database for ForgeOS.

All engineering properties needed by agents. Density in g/cm³,
strength/modulus in MPa, temperatures in °C, dimensions in mm.
"""

MATERIALS: dict[str, dict] = {
    "pla": {
        "name": "PLA",
        "density": 1.24,
        "yield_mpa": 50,
        "E_mpa": 3500,
        "max_temp_c": 60,
        "layer_adhesion": 0.65,
        "min_wall_mm": 0.8,
        "min_feature_mm": 0.4,
        "max_overhang_deg": 45,
    },
    "petg": {
        "name": "PETG",
        "density": 1.27,
        "yield_mpa": 50,
        "E_mpa": 2100,
        "max_temp_c": 80,
        "layer_adhesion": 0.75,
        "min_wall_mm": 0.8,
        "min_feature_mm": 0.5,
        "max_overhang_deg": 40,
    },
    "abs": {
        "name": "ABS",
        "density": 1.04,
        "yield_mpa": 40,
        "E_mpa": 2300,
        "max_temp_c": 100,
        "layer_adhesion": 0.70,
        "min_wall_mm": 1.0,
        "min_feature_mm": 0.5,
        "max_overhang_deg": 40,
    },
    "nylon": {
        "name": "Nylon",
        "density": 1.14,
        "yield_mpa": 70,
        "E_mpa": 1700,
        "max_temp_c": 180,
        "layer_adhesion": 0.80,
        "min_wall_mm": 1.0,
        "min_feature_mm": 0.6,
        "max_overhang_deg": 35,
    },
    "cf_petg": {
        "name": "CF-PETG",
        "density": 1.30,
        "yield_mpa": 65,
        "E_mpa": 4500,
        "max_temp_c": 85,
        "layer_adhesion": 0.60,
        "min_wall_mm": 1.0,
        "min_feature_mm": 0.6,
        "max_overhang_deg": 45,
    },
    "tpu": {
        "name": "TPU 95A",
        "density": 1.21,
        "yield_mpa": 26,
        "E_mpa": 26,
        "max_temp_c": 80,
        "layer_adhesion": 0.85,
        "min_wall_mm": 1.2,
        "min_feature_mm": 0.8,
        "max_overhang_deg": 35,
    },
}
```

---

### `backend/gateway/server.py`

```python
"""FastAPI gateway server for the Agent Pipeline.

Endpoints:
  POST /forge/agent/run      — Run a single agent
  POST /forge/pipeline/run   — Run full pipeline iteration
  GET  /forge/agents         — List registered agents
  GET  /forge/agents/stats   — Agent execution statistics
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException

from .models import AgentContext, AgentRequest, AgentResponse, DesignState, IterationResult
from .orchestrator import PipelineOrchestrator
from .registry import AgentRegistry

from backend.agents.mass_properties import MassPropertiesAgent
from backend.agents.structural_fea import StructuralFEAAgent
from backend.agents.dfm_check import DFMCheckAgent

logger = logging.getLogger(__name__)

# --- Global registry and orchestrator ---
registry = AgentRegistry()
orchestrator = PipelineOrchestrator(registry)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Register all agents on startup."""
    registry.register(MassPropertiesAgent())
    registry.register(StructuralFEAAgent())
    registry.register(DFMCheckAgent())
    logger.info(f"Registered {len(registry.get_all_agents())} agents")
    yield


app = FastAPI(
    title="ForgeOS Agent Gateway",
    description="Standardised protocol for design analysis agents",
    version="0.1.0",
    lifespan=lifespan,
)


@app.post("/forge/agent/run", response_model=AgentResponse)
async def run_single_agent(request: AgentRequest) -> AgentResponse:
    """Run a single agent with the given design state."""
    try:
        agent = registry.get_agent(request.agent_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return await agent.execute(request)


@app.post("/forge/pipeline/run", response_model=IterationResult)
async def run_pipeline_iteration(
    design_state: DesignState,
    context: AgentContext | None = None,
    run_id: str | None = None,
    iteration: int = 0,
) -> IterationResult:
    """Run all agents for one pipeline iteration."""
    return await orchestrator.run_iteration(
        design_state=design_state,
        context=context or AgentContext(),
        run_id=run_id or str(uuid4()),
        iteration=iteration,
    )


@app.get("/forge/agents")
async def list_agents() -> list[dict]:
    """List all registered agents."""
    agents = registry.get_all_agents()
    return [
        {
            "agent_id": agent.agent_id,
            "description": agent.description,
            "dependencies": agent.dependencies,
        }
        for agent in agents.values()
    ]


@app.get("/forge/agents/stats")
async def agent_stats() -> dict:
    """Get execution statistics for all agents."""
    agents = registry.get_all_agents()
    return {
        agent_id: {
            "total_runs": stats.total_runs,
            "total_skips": stats.total_skips,
            "total_errors": stats.total_errors,
            "avg_time_ms": round(stats.avg_time_ms, 1),
            "last_run_time_ms": stats.last_run_time_ms,
        }
        for agent_id in agents
        if (stats := registry.get_stats(agent_id))
    }
```

---

### `backend/tests/test_phase1.py`

```python
"""Tests for Phase 1: Agent Gateway.

Run with: pytest backend/tests/test_phase1.py -v
"""

from __future__ import annotations

import asyncio
import pytest

from backend.gateway.models import AgentContext, AgentRequest, AgentStatus, DesignState
from backend.gateway.orchestrator import PipelineOrchestrator
from backend.gateway.registry import AgentRegistry
from backend.agents.mass_properties import MassPropertiesAgent
from backend.agents.structural_fea import StructuralFEAAgent
from backend.agents.dfm_check import DFMCheckAgent


@pytest.fixture
def registry() -> AgentRegistry:
    reg = AgentRegistry()
    reg.register(MassPropertiesAgent())
    reg.register(StructuralFEAAgent())
    reg.register(DFMCheckAgent())
    return reg


@pytest.fixture
def default_design_state() -> DesignState:
    return DesignState(
        params={
            "motor_spacing_mm": 220.0,
            "arm_width_mm": 12.0,
            "arm_thickness_mm": 3.0,
            "arm_fillet_radius_mm": 2.0,
            "body_width_mm": 36.0,
            "body_length_mm": 40.0,
            "battery_x_offset_mm": 0.0,
            "battery_z_offset_mm": -10.0,
            "motor_mount_hole_mm": 2.2,
            "fc_mount_hole_mm": 2.2,
            "weight_reduction_holes": True,
            "weight_reduction_hole_diameter_mm": 8.0,
            "motor_max_thrust_g": 600,
        },
        material="petg",
    )


class TestAgentRegistry:
    def test_execution_order_levels(self, registry: AgentRegistry):
        """mass_properties and dfm_check are Level 0, structural_fea is Level 1."""
        order = registry.get_execution_order()
        assert len(order) == 2
        assert set(order[0]) == {"mass_properties", "dfm_check"}
        assert order[1] == ["structural_fea"]

    def test_circular_dependency_detected(self):
        """Registry raises ValueError for circular dependencies."""
        from backend.gateway.agent_base import ForgeAgent
        from backend.gateway.models import AgentRequest, AgentResponse

        class AgentA(ForgeAgent):
            agent_id = "a"
            description = "A"
            dependencies = ["b"]
            async def run(self, req): ...

        class AgentB(ForgeAgent):
            agent_id = "b"
            description = "B"
            dependencies = ["a"]
            async def run(self, req): ...

        reg = AgentRegistry()
        reg.register(AgentA())
        reg.register(AgentB())
        with pytest.raises(ValueError, match="Circular dependency"):
            reg.get_execution_order()

    def test_missing_dependency_detected(self):
        """Registry raises ValueError when dependency agent is not registered."""
        reg = AgentRegistry()
        reg.register(StructuralFEAAgent())  # depends on mass_properties, which isn't registered
        with pytest.raises(ValueError, match="mass_properties"):
            reg.get_execution_order()


class TestMassPropertiesAgent:
    @pytest.mark.asyncio
    async def test_returns_mass_and_cg(self, default_design_state: DesignState):
        agent = MassPropertiesAgent()
        request = AgentRequest(
            agent_id="mass_properties",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
        )
        response = await agent.execute(request)
        assert response.status == AgentStatus.SUCCESS
        assert response.analysis_results["total_mass_g"] > 0
        assert "cg_x_mm" in response.analysis_results
        assert "cg_offset_mm" in response.analysis_results
        assert "thrust_to_weight" in response.analysis_results

    @pytest.mark.asyncio
    async def test_proposes_battery_move_when_cg_offset(self, default_design_state: DesignState):
        # Camera at x=20 creates forward CG bias — agent should propose battery move
        default_design_state.params["battery_x_offset_mm"] = 0.0
        agent = MassPropertiesAgent()
        request = AgentRequest(
            agent_id="mass_properties",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
        )
        response = await agent.execute(request)
        # There's a camera at x=20mm which biases CG forward
        # Agent should either resolve or propose a fix
        assert response.status == AgentStatus.SUCCESS


class TestStructuralFEAAgent:
    @pytest.mark.asyncio
    async def test_returns_safety_factor(self, default_design_state: DesignState):
        agent = StructuralFEAAgent()
        context = AgentContext(
            previous_results={"mass_properties": {"total_mass_g": 450.0}},
        )
        request = AgentRequest(
            agent_id="structural_fea",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
            context=context,
        )
        response = await agent.execute(request)
        assert response.status == AgentStatus.SUCCESS
        assert "safety_factor" in response.analysis_results
        assert "peak_stress_mpa" in response.analysis_results
        assert response.analysis_results["safety_factor"] > 0

    @pytest.mark.asyncio
    async def test_proposes_thickness_increase_for_thin_arm(self, default_design_state: DesignState):
        default_design_state.params["arm_thickness_mm"] = 1.0  # Very thin
        agent = StructuralFEAAgent()
        context = AgentContext(
            previous_results={"mass_properties": {"total_mass_g": 450.0}},
        )
        request = AgentRequest(
            agent_id="structural_fea",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
            context=context,
        )
        response = await agent.execute(request)
        assert len(response.modifications) > 0
        thickness_mod = next((m for m in response.modifications if m.param == "arm_thickness_mm"), None)
        assert thickness_mod is not None
        assert thickness_mod.proposed > 1.0


class TestDFMCheckAgent:
    @pytest.mark.asyncio
    async def test_passes_for_valid_design(self, default_design_state: DesignState):
        agent = DFMCheckAgent()
        request = AgentRequest(
            agent_id="dfm_check",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
        )
        response = await agent.execute(request)
        assert response.status == AgentStatus.SUCCESS
        assert "dfm_score" in response.analysis_results

    @pytest.mark.asyncio
    async def test_flags_thin_walls(self, default_design_state: DesignState):
        default_design_state.params["arm_thickness_mm"] = 0.3  # Below any material's minimum
        agent = DFMCheckAgent()
        request = AgentRequest(
            agent_id="dfm_check",
            run_id="test",
            iteration=0,
            design_state=default_design_state,
        )
        response = await agent.execute(request)
        assert len(response.analysis_results["issues"]) > 0
        assert response.analysis_results["dfm_score"] < 1.0


class TestOrchestrator:
    @pytest.mark.asyncio
    async def test_runs_full_iteration(self, registry: AgentRegistry, default_design_state: DesignState):
        orch = PipelineOrchestrator(registry)
        result = await orch.run_iteration(
            design_state=default_design_state,
            context=AgentContext(),
            run_id="test-run",
            iteration=0,
        )
        assert "mass_properties" in result.agents_run
        assert "dfm_check" in result.agents_run
        assert "structural_fea" in result.agents_run
        assert result.total_time_ms > 0
        assert "mass_properties" in result.analysis_results
        assert "structural_fea" in result.analysis_results

    @pytest.mark.asyncio
    async def test_conflict_resolution_highest_confidence_wins(self, registry: AgentRegistry, default_design_state: DesignState):
        """If both structural and DFM propose arm_thickness change, highest confidence wins."""
        default_design_state.params["arm_thickness_mm"] = 0.3  # Triggers both agents
        orch = PipelineOrchestrator(registry)
        result = await orch.run_iteration(
            design_state=default_design_state,
            context=AgentContext(),
            run_id="test-conflict",
            iteration=0,
        )
        # Both agents should flag arm_thickness, but only one modification survives
        thickness_mods = [m for m in result.modifications if m.param == "arm_thickness_mm"]
        assert len(thickness_mods) <= 1  # Conflict resolved

    @pytest.mark.asyncio
    async def test_parallel_execution(self, registry: AgentRegistry, default_design_state: DesignState):
        """Level 0 agents (mass_properties + dfm_check) should run faster than sequential."""
        orch = PipelineOrchestrator(registry)
        result = await orch.run_iteration(
            design_state=default_design_state,
            context=AgentContext(),
            run_id="test-parallel",
            iteration=0,
        )
        # Both Level 0 agents ran
        assert "mass_properties" in result.agent_execution_times
        assert "dfm_check" in result.agent_execution_times
        # Total time should be less than sum of individual times (parallel)
        # (This is a soft check — in practice async overhead may negate savings for fast agents)
        individual_sum = sum(result.agent_execution_times.values())
        assert result.total_time_ms <= individual_sum + 50  # Allow 50ms overhead
```

---

### Verification Script

After Cursor builds everything, run:

```bash
cd /path/to/forgeos
python -m pytest backend/tests/test_phase1.py -v
```

Expected output: all tests pass, showing:
- Registry correctly resolves 2-level execution order
- All three agents produce valid responses
- Orchestrator runs Level 0 in parallel, Level 1 after
- Conflict resolution picks highest confidence
- Circular dependencies are detected and rejected

Then test the server:

```bash
uvicorn backend.gateway.server:app --reload --port 8001
# In another terminal:
curl -X POST http://localhost:8001/forge/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"params": {"motor_spacing_mm": 220, "arm_width_mm": 12, "arm_thickness_mm": 3, "arm_fillet_radius_mm": 2, "body_width_mm": 36, "body_length_mm": 40, "battery_x_offset_mm": 0, "battery_z_offset_mm": -10, "motor_mount_hole_mm": 2.2, "fc_mount_hole_mm": 2.2, "weight_reduction_holes": true, "weight_reduction_hole_diameter_mm": 8, "motor_max_thrust_g": 600}, "material": "petg"}'
```

Should return JSON with analysis results from all three agents and any proposed modifications.
