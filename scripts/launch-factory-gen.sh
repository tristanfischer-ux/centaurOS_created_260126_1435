#!/bin/bash
cd "$(dirname "$0")"
export PYTHONUNBUFFERED=1
> factory_profiles_log.txt
python3 generate-factory-profiles.py 2>> factory_profiles_stderr.log
