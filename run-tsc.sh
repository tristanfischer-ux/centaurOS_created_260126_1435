#!/bin/bash
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
npx tsc --noEmit 2>&1 | grep -v "plan/" | grep -v "tasks.test" | grep -v "gate-3" | head -30
