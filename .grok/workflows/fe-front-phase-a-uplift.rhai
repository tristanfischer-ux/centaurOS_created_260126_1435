// FE Front Phase A uplift — truth + Jack spine + gate
// Council-amended plan: docs/plans/FE-FRONT-UPLIFT-PLAN-EASY-TO-HARD-2026-08-04.md
// Run after agent implements W0/W1 artefacts to independently verify.
let meta = #{
    name: "fe-front-phase-a-uplift",
    description: "Verify Phase A uplift: Path B dual bars, bar-B freshness, Jack spine pack, coherence, ship_ok false",
    phases: [
        #{ title: "Truth", detail: "Twin stamps + bar-B register Path B numbers" },
        #{ title: "Jack spine", detail: "Verdict / opens / how-to-read figures present" },
        #{ title: "Gate", detail: "phase_a_uplift_gate.py + coherence enforce" },
        #{ title: "Council check", detail: "Independent audit that ship_ok still false and no overclaim" },
    ],
};

let repo = if args.repo != () { args.repo } else { "/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel" };
let twin = if args.twin != () { args.twin } else { "out/formula-e-front-mgu-20260729-1432" };

let gate_schema = #{
    "type": "object",
    "properties": #{
        "ok": #{ "type": "boolean" },
        "findings": #{
            "type": "array",
            "items": #{
                "type": "object",
                "properties": #{
                    "id": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
                "required": ["id", "severity", "issue", "evidence"],
            },
        },
        "ship_ok_still_false": #{ "type": "boolean" },
        "path_b_mean_nm": #{ "type": "number" },
        "architecture_duty_nm": #{ "type": "number" },
        "binding_duty_nm": #{ "type": "number" },
        "jack_spine_complete": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
    },
    "required": ["ok", "findings", "ship_ok_still_false", "path_b_mean_nm", "architecture_duty_nm", "binding_duty_nm", "jack_spine_complete", "summary"],
};

// Deterministic gate first (no LLM)
let gate_cmd = `cd ${repo} && .venv/bin/python scripts/motor-stack/phase_a_uplift_gate.py --twin ${twin}`;
let gate_out = shell(gate_cmd);
let gate_ok = gate_out.exit_code == 0;

// Independent checker seat (maker ≠ checker)
let audit = agent(#{
    role: "audit",
    model: "minimax/minimax-m3",
    prompt: `You are an independent checker for FE Front Phase A uplift.
Twin: ${twin}
Run/read results of: ${gate_cmd}
Exit code was ${gate_out.exit_code}. Output:
${gate_out.stdout}

Also skim:
- ${twin}/state.json quantities for FE mean, architecture_duty, binding, ship_ok, product basis
- ${twin}/bar-b-register-freshness.json live_artefacts.em_source
- ${twin}/_motor_stack/jack_em_pack/ for 00-verdict, 00b-open, 00c-how-to-read, 06-thermal

Return JSON matching the schema. ok=true only if gate passed AND ship_ok false AND product basis is option_screen AND em_source is PATH_B_DEC009 AND jack spine files exist.
Do not invent numbers. Severity blocking if ship_ok true or mean still 81.56.`,
    schema: gate_schema,
});

// Long-context corroborator (Qwen 3.8)
let qwen = agent(#{
    role: "audit",
    model: "qwen/qwen3.8-max",
    prompt: `Corroborate Phase A uplift honesty for Jack.
Gate exit ${gate_out.exit_code}. MiniMax audit summary: ${audit.summary}
Confirm: (1) dual-bar arithmetic 122.1 clears ~104.1 misses ~125.2 (2) no duty_screen greenwash (3) homologation not claimed.
Return same JSON schema. If MiniMax ok=true but you find overclaim in jack captions, set ok=false with findings.`,
    schema: gate_schema,
});

let overall = gate_ok && audit.ok && qwen.ok && audit.ship_ok_still_false && qwen.ship_ok_still_false;

print(`PHASE_A_GATE deterministic=${gate_ok} minimax_ok=${audit.ok} qwen_ok=${qwen.ok} overall=${overall}`);
if !overall {
    print("FINDINGS:");
    for f in audit.findings { print(`  [minimax] ${f.severity}: ${f.issue}`); }
    for f in qwen.findings { print(`  [qwen] ${f.severity}: ${f.issue}`); }
}

#{
    ok: overall,
    gate_exit: gate_out.exit_code,
    audit: audit,
    qwen: qwen,
}
