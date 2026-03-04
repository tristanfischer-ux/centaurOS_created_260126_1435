#!/bin/bash
cd "$(dirname "$0")"
export PYTHONUNBUFFERED=1
python3 fix-factory-accuracy.py > /dev/null 2>> factory_accuracy_fix_stderr.log
