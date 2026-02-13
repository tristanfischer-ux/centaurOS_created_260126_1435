"""
ForgeOS Core — Domain Grammar Base Classes
============================================

Every product domain (buildings, drones, enclosures, rockets, etc.) has a Grammar
that encodes how experienced engineers design that class of product.

Usage:
    grammar = BuildingGrammar()
    assembly, result = grammar.generate({"length": 12000, "width": 3658})
    grammar.export(assembly, "house", formats=["step", "glb"])
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq


# ═══════════════════════════════════════════════════════════════
# PARAMETER SPECS — declare what a grammar accepts
# ═══════════════════════════════════════════════════════════════

@dataclass
class ParamSpec:
    """
    Specification for a single grammar parameter.
    
    Supported types:
    - "float": numeric with optional min/max
    - "int": integer with optional min/max  
    - "bool": True/False
    - "enum": one of enum_options strings
    - "list": list of values (e.g., partition X positions)
    - "dict_list": list of dicts (e.g., opening specs with position, width, height)
    
    A parameter with default=None means it will be auto-derived during
    derive_skeleton(). It is skipped during input validation.
    """
    name: str
    type: str                        # "float", "int", "enum", "bool", "list", "dict_list"
    unit: Optional[str] = None       # "mm", "inch", "degrees", None
    description: str = ""
    default: Any = None
    min_val: Any = None
    max_val: Any = None
    enum_options: Optional[List[str]] = None

    def validate(self, value) -> Tuple[bool, str]:
        """Check if a value satisfies this spec. Returns (ok, message)."""
        if value is None:
            return True, ""

        if self.type == "float":
            try:
                v = float(value)
            except (TypeError, ValueError):
                return False, f"{self.name}: expected float, got {type(value).__name__}"
            if self.min_val is not None and v < self.min_val:
                return False, f"{self.name}: {v} < minimum {self.min_val}"
            if self.max_val is not None and v > self.max_val:
                return False, f"{self.name}: {v} > maximum {self.max_val}"

        elif self.type == "int":
            try:
                v = int(value)
            except (TypeError, ValueError):
                return False, f"{self.name}: expected int, got {type(value).__name__}"
            if self.min_val is not None and v < self.min_val:
                return False, f"{self.name}: {v} < minimum {self.min_val}"
            if self.max_val is not None and v > self.max_val:
                return False, f"{self.name}: {v} > maximum {self.max_val}"

        elif self.type == "enum":
            if self.enum_options and value not in self.enum_options:
                return False, f"{self.name}: '{value}' not in {self.enum_options}"

        elif self.type == "bool":
            if not isinstance(value, bool):
                return False, f"{self.name}: expected bool, got {type(value).__name__}"

        elif self.type == "list":
            if not isinstance(value, list):
                return False, f"{self.name}: expected list, got {type(value).__name__}"

        elif self.type == "dict_list":
            if not isinstance(value, list):
                return False, f"{self.name}: expected list of dicts, got {type(value).__name__}"
            for i, item in enumerate(value):
                if not isinstance(item, dict):
                    return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"

        return True, ""


# ═══════════════════════════════════════════════════════════════
# CONSTRAINT — a rule that must hold true
# ═══════════════════════════════════════════════════════════════

@dataclass
class Constraint:
    """
    A named constraint that validates derived parameters in the skeleton.
    
    check_fn: callable taking skeleton dict, returning (passed: bool, message: str).
    severity: "error" blocks the build, "warning" is advisory only.
    
    Example:
        Constraint(
            name="min_ceiling_height",
            description="UK Building Regs: habitable rooms min 2100mm",
            check_fn=lambda s: (s["floor_height"] >= 2100,
                                f"Floor height {s['floor_height']}mm < 2100mm"),
            severity="error"
        )
    """
    name: str
    description: str
    check_fn: Any  # Callable[[dict], Tuple[bool, str]]
    severity: str = "error"

    def check(self, skeleton: dict) -> Tuple[bool, str]:
        return self.check_fn(skeleton)


# ═══════════════════════════════════════════════════════════════
# VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════

@dataclass
class ValidationResult:
    passed: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def __str__(self):
        status = "PASSED" if self.passed else "FAILED"
        lines = [status]
        for e in self.errors:
            lines.append(f"  ERROR: {e}")
        for w in self.warnings:
            lines.append(f"  WARN:  {w}")
        for k, v in self.metrics.items():
            lines.append(f"  {k}: {v}")
        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# DOMAIN GRAMMAR — the abstract base class
# ═══════════════════════════════════════════════════════════════

class DomainGrammar(ABC):
    """
    Base class for all domain grammars.
    
    MUST IMPLEMENT:
        name            (property)  Short ID: 'building', 'drone'
        display_name    (property)  Human name: 'FPV Quadcopter'
        description     (property)  One-liner
        param_specs()               List[ParamSpec] of accepted parameters
        derive_skeleton(params)     Pure math: params → all derived dimensions
        build(skeleton)             CadQuery: skeleton dict → cq.Assembly
    
    MAY OVERRIDE:
        defaults()                  Dict of default parameter values
        constraints()               List[Constraint] for post-build validation
        validate(skeleton, assy)    Custom validation logic
    
    PIPELINE (generate() calls these in order):
        1. Merge user params with defaults()
        2. validate_params() against param_specs()
        3. derive_skeleton() — pure math, no geometry
        4. build() — CadQuery geometry from skeleton dict
        5. validate() — constraints + assembly metrics
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def display_name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @abstractmethod
    def param_specs(self) -> List[ParamSpec]: ...

    def defaults(self) -> Dict[str, Any]:
        return {s.name: s.default for s in self.param_specs() if s.default is not None}

    def constraints(self) -> List[Constraint]:
        return []

    @abstractmethod
    def derive_skeleton(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Level 2: params → skeleton (all derived dimensions).
        
        RULES:
        - Pure math only. No CadQuery, no geometry, no file I/O.
        - Return dict with BOTH original params AND derived values.
        - Auto-derive any params that were None.
        - The skeleton dict is the SINGLE SOURCE OF TRUTH for build().
        """
        ...

    @abstractmethod
    def build(self, skeleton: Dict[str, Any]) -> cq.Assembly:
        """
        Level 3: skeleton → CadQuery Assembly.
        
        RULES:
        - Read ONLY from skeleton dict.
        - Every part MUST have a name: name="TopPlate"
        - Every part SHOULD have a colour: color=cq.Color(r, g, b)  (0-1 range)
        - Return cq.Assembly, not Workplane or Compound.
        """
        ...

    def validate(self, skeleton: Dict[str, Any], assembly: cq.Assembly) -> ValidationResult:
        """Post-build validation: run constraints, measure assembly envelope."""
        result = ValidationResult(passed=True)

        for constraint in self.constraints():
            ok, msg = constraint.check(skeleton)
            if not ok:
                if constraint.severity == "error":
                    result.errors.append(f"[{constraint.name}] {msg}")
                    result.passed = False
                else:
                    result.warnings.append(f"[{constraint.name}] {msg}")

        compound = assembly.toCompound()
        bb = compound.BoundingBox()
        result.metrics["part_count"] = len(assembly.children)
        result.metrics["envelope_mm"] = f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"

        return result

    def validate_params(self, params: Dict[str, Any]) -> ValidationResult:
        """Validate user parameters against param_specs before building."""
        result = ValidationResult(passed=True)
        full_params = {**self.defaults(), **params}

        for spec in self.param_specs():
            if spec.name not in full_params:
                if spec.default is None and spec.type not in ("dict_list", "list"):
                    result.errors.append(f"Required parameter '{spec.name}' not provided")
                    result.passed = False
                continue
            ok, msg = spec.validate(full_params[spec.name])
            if not ok:
                result.errors.append(msg)
                result.passed = False

        return result

    def generate(self, params: Dict[str, Any]) -> Tuple[cq.Assembly, ValidationResult]:
        """Full pipeline: validate → derive → build → validate. Returns (assembly, result)."""
        full_params = {**self.defaults(), **params}

        param_result = self.validate_params(full_params)
        if not param_result.passed:
            return None, param_result

        skeleton = self.derive_skeleton(full_params)
        assembly = self.build(skeleton)
        result = self.validate(skeleton, assembly)

        return assembly, result

    def export(self, assembly: cq.Assembly, base_name: str,
               formats: List[str] = None) -> Dict[str, str]:
        """Export assembly to files. Returns {format: filepath}. Formats: step, glb, stl."""
        if formats is None:
            formats = ["step", "glb"]

        paths = {}
        for fmt in formats:
            if fmt == "step":
                path = f"{base_name}.step"
                assembly.save(path)
                paths["step"] = path
            elif fmt == "glb":
                path = f"{base_name}.glb"
                assembly.save(path, exportType="GLTF",
                              tolerance=1.0, angularTolerance=0.2)
                paths["glb"] = path
            elif fmt == "stl":
                path = f"{base_name}.stl"
                cq.exporters.export(assembly.toCompound(), path,
                                    exportType='STL',
                                    tolerance=0.5, angularTolerance=0.1)
                paths["stl"] = path

        return paths
