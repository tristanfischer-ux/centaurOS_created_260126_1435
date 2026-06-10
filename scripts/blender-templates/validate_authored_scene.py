"""validate_authored_scene.py — static validation of an LLM-authored
blender-scene.py against the B2 primitive grammar (ANVIL plan WS-B/B2).

Three layers, all deterministic, no Blender needed:
  1. AST parse (syntax).
  2. Allowlist walk — only forge_blender_lib public functions from
     primitive-api-schema.json may be called as fl.*; no raw bpy, no mesh
     ops, no imports beyond the lib + a tiny stdlib set, no dunder access,
     no eval/exec/open-class escape hatches.
  3. Kwarg type-check — every fl.<primitive>() call's keyword names must
     exist in the schema, required params must be supplied, and literal
     numeric params (*_mm, n_*) must be numeric literals when literal.

Also enforces the authored-scene shape: exactly one fl.run_render_pipeline
call, >=1 fl.declare_structure_root, and dimension-provenance trailing
comments (`# <- digest: ...`) on >=80% of prim_* call statements.

Usage:
  python3 validate_authored_scene.py <scene.py> <primitive-api-schema.json>
Prints a JSON report {ok, violations:[{line, rule, detail}]}; exit 3 if not ok.
"""
import ast
import json
import re
import sys
from pathlib import Path

ALLOWED_IMPORTS = {"forge_blender_lib", "math", "os", "sys", "json"}
ALLOWED_FROM_IMPORTS = {("pathlib", "Path")}
ALLOWED_BUILTINS = {
    "range", "len", "int", "float", "str", "bool", "max", "min", "abs",
    "round", "print", "enumerate", "zip", "list", "dict", "tuple", "set",
    "sorted", "sum", "reversed", "isinstance", "Path",
}
FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "open", "__import__", "getattr", "setattr",
    "delattr", "globals", "locals", "vars", "input", "breakpoint", "bpy",
    "subprocess", "socket", "importlib", "shutil",
}
# Benign method names callable on non-fl objects (Path, dict, list, str…).
ALLOWED_METHODS = {
    "mkdir", "insert", "get", "append", "update", "items", "keys", "values",
    "extend", "join", "format", "lower", "upper", "replace", "exists",
    "parent", "split", "strip", "copy", "index", "pop", "setdefault",
}
# math.* and these dotted-call prefixes are always fine.
ALLOWED_DOTTED_PREFIXES = {("math",), ("os", "environ"), ("sys", "path")}


def _dotted(node):
    """Attribute chain -> tuple of names, e.g. sys.path.insert -> (sys,path,insert)."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return tuple(reversed(parts))
    return None


def validate(source: str, schema: dict) -> dict:
    violations = []

    def V(line, rule, detail):
        violations.append({"line": line, "rule": rule, "detail": detail})

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return {"ok": False, "violations": [
            {"line": e.lineno or 0, "rule": "syntax", "detail": str(e)}]}

    fns = schema.get("functions", {})
    fl_alias = "fl"
    render_pipeline_calls = 0
    structure_root_calls = 0
    prim_call_count = 0

    for node in ast.walk(tree):
        # ── imports ──────────────────────────────────────────────────────
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name not in ALLOWED_IMPORTS:
                    V(node.lineno, "import", f"import {a.name} not allowed")
                if a.name == "forge_blender_lib":
                    fl_alias = a.asname or "forge_blender_lib"
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                if (node.module, a.name) not in ALLOWED_FROM_IMPORTS:
                    V(node.lineno, "import",
                      f"from {node.module} import {a.name} not allowed")
        # ── dunder / forbidden names ──────────────────────────────────────
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                V(node.lineno, "dunder", f"dunder attribute .{node.attr}")
        elif isinstance(node, ast.Name):
            if node.id in FORBIDDEN_NAMES:
                V(node.lineno, "forbidden", f"name {node.id!r} not allowed")

    # ── calls ─────────────────────────────────────────────────────────────
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        if isinstance(f, ast.Attribute):
            chain = _dotted(f)
            if chain and chain[0] == fl_alias:
                name = chain[-1]
                if len(chain) != 2 or name not in fns:
                    V(node.lineno, "allowlist",
                      f"{'.'.join(chain)}() is not in the authored-scene API "
                      f"(see PRIMITIVE-API.md)")
                    continue
                if name == "run_render_pipeline":
                    render_pipeline_calls += 1
                if name == "declare_structure_root":
                    structure_root_calls += 1
                if name.startswith("prim_"):
                    prim_call_count += 1
                params = fns[name]["params"]
                pnames = [p["name"] for p in params]
                if len(node.args) > len(pnames):
                    V(node.lineno, "arity",
                      f"{name}() takes <= {len(pnames)} positional args, got {len(node.args)}")
                supplied = set(pnames[:len(node.args)])
                for kw in node.keywords:
                    if kw.arg is None:
                        V(node.lineno, "kwargs", f"{name}(**...) splat not allowed")
                        continue
                    if kw.arg not in pnames:
                        V(node.lineno, "kwargs",
                          f"{name}() has no parameter {kw.arg!r} "
                          f"(valid: {', '.join(pnames)})")
                    supplied.add(kw.arg)
                    # literal numeric check for mm / count params
                    if (re.search(r"(_mm$|^n_)", kw.arg)
                            and isinstance(kw.value, ast.Constant)
                            and not isinstance(kw.value.value, (int, float))):
                        V(node.lineno, "type",
                          f"{name}({kw.arg}=...) must be numeric, "
                          f"got {type(kw.value.value).__name__}")
                missing = [p["name"] for p in params
                           if p["required"] and p["name"] not in supplied]
                if missing:
                    V(node.lineno, "required",
                      f"{name}() missing required param(s): {', '.join(missing)}")
            elif chain and chain[:2] in ALLOWED_DOTTED_PREFIXES or \
                    chain and chain[:1] in ALLOWED_DOTTED_PREFIXES:
                pass  # math.*, os.environ.*, sys.path.*
            else:
                attr = f.attr
                if attr not in ALLOWED_METHODS and not (chain and chain[0] == fl_alias):
                    V(node.lineno, "method",
                      f"method call .{attr}() not in the benign-method set")
        elif isinstance(f, ast.Name):
            if f.id in FORBIDDEN_NAMES:
                V(node.lineno, "forbidden", f"call to {f.id}() not allowed")
            elif f.id not in ALLOWED_BUILTINS:
                # locally-defined helper functions are fine
                defined = {n.name for n in ast.walk(tree)
                           if isinstance(n, ast.FunctionDef)}
                if f.id not in defined:
                    V(node.lineno, "builtin",
                      f"call to {f.id}() — not an allowed builtin or local def")

    # ── shape rules ───────────────────────────────────────────────────────
    if render_pipeline_calls != 1:
        V(0, "shape", f"exactly ONE fl.run_render_pipeline call required, "
                      f"found {render_pipeline_calls}")
    if structure_root_calls < 1:
        V(0, "shape", "at least one fl.declare_structure_root call required")

    # ── provenance comments (regex — trailing comments are not in the AST) ─
    prov = len(re.findall(r"#\s*<-\s*digest:", source))
    if prim_call_count > 0 and prov < prim_call_count * 0.8:
        V(0, "provenance",
          f"only {prov} '# <- digest:' provenance comments for "
          f"{prim_call_count} prim_* calls — every dimension must trace to a "
          f"design-digest field (>=80% of primitive calls)")

    return {"ok": not violations, "violations": violations}


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: validate_authored_scene.py <scene.py> <schema.json>",
              file=sys.stderr)
        return 2
    source = Path(sys.argv[1]).read_text()
    schema = json.loads(Path(sys.argv[2]).read_text())
    report = validate(source, schema)
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 3


if __name__ == "__main__":
    sys.exit(main())
