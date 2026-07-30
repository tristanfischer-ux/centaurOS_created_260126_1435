# CQ Gears planetary gearset

- Source: https://github.com/meadiode/cq_gears
- Revision: `e73874cf17a25447a99b1e7c22a4d5af38560e9c`
- Upstream example: `examples/ring_gears_and_planetary_gearsets.ipynb`
- License: Apache License 2.0
- Local change: the documented three-planet example is wrapped in a standalone
  exporter that writes STEP and STL.

Rebuild with a CadQuery environment:

```bash
python -m pip install -r requirements.txt
python generate_planetary.py
```
