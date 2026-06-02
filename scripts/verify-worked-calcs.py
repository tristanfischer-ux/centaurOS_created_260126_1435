#!/usr/bin/env python3
"""Deterministic worked-calculation arithmetic gate for the orchestrator physics tools.

The PDF "Tools Used" appendix prints, per tool, inputs -> formula -> SUBSTITUTED NUMBERS
-> result, so a reviewer can re-check the maths by hand (they never see the Python). A
substitution whose numbers DON'T add up to the stated result misleads the reviewer — worse
than none. This runs every tool that emits a worked-calc, re-evaluates each printed
substitution, and FAILS any that don't reproduce their stated result.

This caught 58 broken substitutions (missing unit conversions, transcendentals given a
re-evaluable working, values-key/formula-symbol mismatches, branch-dependent formulae,
rounding drift) across the 2026-06-02 cross-class fan-out that the LLM critic pass missed.
Keep it green: run after ANY change to a tool's worked_calc emission.

  python3 scripts/verify-worked-calcs.py [tool1.py tool2.py ...]   # default: all tools importing _worked
  THRESH=0.3 python3 scripts/verify-worked-calcs.py foo.py         # stricter % tolerance (default 1.0)

Exit 0 if clean, 1 if any failure. A "SYMBOL" failure = the substitution still contains an
un-substituted name (a values-dict key that doesn't textually match the formula, OR a
function like log10/ceil/min/mod that should have been SKIPPED, not given a worked_calc).

Note: tools that need a live scientific library (pandapower/qutip/...) or a required input
emit no worked block on {} and are reported under "no worked output" — verify those with a
representative input separately; they are not failures.
"""
import json, subprocess, re, math, os, glob, sys

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib', 'orchestrator', 'tools', 'python')
THRESH = float(os.environ.get('THRESH', '1.0'))

args = list(sys.argv[1:])
if args:
    TOOLS = [os.path.basename(a) for a in args]
else:
    TOOLS = sorted(os.path.basename(f) for f in glob.glob(os.path.join(DIR, '*.py'))
                   if os.path.basename(f) != '_worked.py' and 'from _worked import' in open(f).read())

def _eval_arith(expr):
    """Tiny safe arithmetic evaluator — NO eval/exec (matches the no-eval convention in
    regression-harness.tsx). Recursive descent over + - * / ^ ( ); returns None on any
    malformed/non-numeric token so a leftover symbol is reported, never crashed on."""
    toks = re.findall(r'\d+\.?\d*(?:[eE][+-]?\d+)?|[+\-*/()^]', expr)
    if not toks:
        return None
    pos = [0]
    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else None
    def parse_expr():
        v = parse_term()
        if v is None:
            return None
        while peek() in ('+', '-'):
            op = toks[pos[0]]; pos[0] += 1
            r = parse_term()
            if r is None:
                return None
            v = v + r if op == '+' else v - r
        return v
    def parse_term():
        v = parse_power()
        if v is None:
            return None
        while peek() in ('*', '/'):
            op = toks[pos[0]]; pos[0] += 1
            r = parse_power()
            if r is None or (op == '/' and r == 0):
                return None
            v = v * r if op == '*' else v / r
        return v
    def parse_power():
        b = parse_factor()
        if b is None:
            return None
        if peek() == '^':
            pos[0] += 1
            e = parse_power()  # right-associative
            if e is None:
                return None
            try:
                return b ** e
            except Exception:
                return None
        return b
    def parse_factor():
        t = peek()
        if t == '(':
            pos[0] += 1
            v = parse_expr()
            if peek() == ')':
                pos[0] += 1
            return v
        if t == '-':
            pos[0] += 1
            v = parse_factor()
            return None if v is None else -v
        if t is not None and re.match(r'^\d', t):
            pos[0] += 1
            return float(t)
        return None
    v = parse_expr()
    return v if pos[0] == len(toks) else None

def seval(mid):
    s = mid.replace(',', '')
    s = re.sub(r'(?<![a-zA-Z0-9_])x(?![a-zA-Z0-9_])', '*', s)   # ' x ' multiply
    s = re.sub(r'\bpi\b', repr(math.pi), s)                     # pi is a literal constant in formulae
    # A leftover letter/name (un-substituted values-key, or a function like log10/ceil/min/mod that
    # should have been SKIPPED, not given a re-evaluable working) means this is not hand-checkable
    # arithmetic — report it as SYMBOL rather than trying to evaluate it.
    if not re.fullmatch(r'[0-9.eE +\-*/()^]+', s):
        return ('SYM', s)
    v = _eval_arith(s)
    return ('OK', v) if (v is not None and math.isfinite(v)) else ('ERR', None)

fails, syms, noout = [], [], []
checked = 0
for t in TOOLS:
    try:
        p = subprocess.run(['python3', t], input='{}', capture_output=True, text=True, timeout=30, cwd=DIR)
        out = json.loads(p.stdout)
    except Exception:
        noout.append(t + ' (run/parse error on {})'); continue
    wk = out.get('worked')
    if not isinstance(wk, list) or not wk:
        noout.append(t); continue
    for w in wk:
        sub = str(w.get('substitution', ''))
        parts = sub.split('=')
        if len(parts) < 3:
            continue
        mid = '='.join(parts[1:-1])
        stated = w.get('result', {}).get('value')
        if not isinstance(stated, (int, float)):
            m = re.search(r'-?[0-9.]+(?:[eE][+-]?[0-9]+)?', parts[-1].replace(',', ''))
            stated = float(m.group()) if m else None
        kind, val = seval(mid)
        if kind == 'SYM':
            syms.append((t, str(w.get('label', '?'))[:40], val[:50])); continue
        if kind == 'ERR' or stated is None:
            continue
        checked += 1
        pct = abs(val - stated) / max(abs(stated), 1e-9) * 100
        if pct > THRESH:
            fails.append((t, str(w.get('label', '?'))[:40], round(val, 5), stated, round(pct, 2)))

print(f"swept {len(TOOLS)} tool(s) · {checked} substitution(s) checked · THRESH={THRESH}%")
if fails:
    print(f"\nFAIL >{THRESH}% ({len(fails)}):")
    for t, l, v, s, p in sorted(fails, key=lambda x: -x[4]):
        print(f"  {p:8.2f}%  {t:34} {l:40} expr={v} stated={s}")
if syms:
    print(f"\nUN-SUBSTITUTED SYMBOL — skip the entry or fix the key ({len(syms)}):")
    for t, l, s in syms:
        print(f"  {t:34} {l:40} -> '{s}'")
if noout:
    print(f"\nno worked output on {{}} ({len(noout)}): {', '.join(noout)}")
if not fails and not syms:
    print("\nCLEAN (all substitutions reproduce their stated result within tolerance)")
sys.exit(1 if (fails or syms) else 0)
