#!/bin/bash
echo "=== src/actions/cad-lab.ts (lines 280-550) ===" > diagnostic_context.txt
sed -n '280,550p' src/actions/cad-lab.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/lib/forge-v2/judge-panels.ts ===" >> diagnostic_context.txt
cat src/lib/forge-v2/judge-panels.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/lib/forge-v2/stage-config.ts ===" >> diagnostic_context.txt
cat src/lib/forge-v2/stage-config.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/app/api/cron/autopilot-tick/route.ts ===" >> diagnostic_context.txt
cat src/app/api/cron/autopilot-tick/route.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/app/api/autopilot-step/route.ts (lines 400-500) ===" >> diagnostic_context.txt
sed -n '400,500p' src/app/api/autopilot-step/route.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/actions/specialists/run-chase-research.ts (lines 270-450) ===" >> diagnostic_context.txt
sed -n '270,450p' src/actions/specialists/run-chase-research.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/actions/cad-lab-supplier-match.ts ===" >> diagnostic_context.txt
grep -C 10 -i 'function match_' src/actions/cad-lab-supplier-match.ts >> diagnostic_context.txt
grep -C 10 -i 'function search' src/actions/cad-lab-supplier-match.ts >> diagnostic_context.txt
echo "" >> diagnostic_context.txt

echo "=== src/lib/forge-v2/stage-gates/runner.ts ===" >> diagnostic_context.txt
cat src/lib/forge-v2/stage-gates/runner.ts >> diagnostic_context.txt
