#!/bin/bash
cd "$(dirname "$0")"
export PYTHONUNBUFFERED=1
> hunt_step_log.txt
python3 hunt-more-step-files.py > /dev/null 2>> hunt_step_stderr.log
