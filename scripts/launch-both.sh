#!/bin/bash
# Launch both background tasks detached from any terminal
cd "$(dirname "$0")"
export PYTHONUNBUFFERED=1

# Clear old logs
> factory_accuracy_fix_log.txt
> factory_accuracy_fix_stderr.log
> hunt_step_log.txt
> hunt_step_stderr.log

echo "Starting factory accuracy fix..."
nohup python3 fix-factory-accuracy.py </dev/null >factory_accuracy_stdout.log 2>factory_accuracy_fix_stderr.log &
FACTORY_PID=$!
echo "Factory fix PID: $FACTORY_PID"

echo "Starting STEP file hunt..."
nohup python3 hunt-more-step-files.py --skip-clone </dev/null >hunt_step_stdout.log 2>hunt_step_stderr.log &
STEP_PID=$!
echo "STEP hunt PID: $STEP_PID"

echo ""
echo "Both running. Monitor with:"
echo "  tail -f scripts/factory_accuracy_fix_log.txt"
echo "  tail -f scripts/hunt_step_log.txt"
echo ""
echo "PIDs: factory=$FACTORY_PID step=$STEP_PID"
