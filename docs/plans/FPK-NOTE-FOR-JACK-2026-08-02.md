# Formula E front powertrain kit — first-pass analysis

**Tristan Fischer · 2 August 2026**

Following up on our conversation. I've built a clean-sheet model of a Gen3-class
front powertrain kit — motor, inverter, single-speed reduction and differential
in a sealed unit — and run it through electromagnetic and structural analysis.

As I mentioned, the real specification is a team/supplier interface document
rather than a public FIA sheet, so I've had to assume a good deal. The
interesting result is not the design itself; it is **which of those assumptions
turns out to matter**.

---

## What I assumed

| | value | where it came from |
|---|---|---|
| Front electrical power | 250 kW | public Gen3 figure |
| Max rotor speed | 19,500 rpm | assumed |
| Housing envelope | Ø198 × 140.5 mm | assumed from package |
| Installation bay | 343 × 259 × 267 mm | assumed |
| Gear ratio | 8:1 | assumed |
| Machine | interior-permanent-magnet, 24 slots, 8 poles | assumed |

Everything in the "assumed" rows is my invention. That is the point of what
follows.

## What the model says

At 250 kW and 19,500 rpm, the required shaft torque is **125.2 N·m**. The machine
I arrived at delivers **81.6 N·m** — about **65% of requirement**, measured over a
full rotor sweep rather than at a single position.

I then tried each way of closing the gap:

- **More rotor diameter.** The housing allows 1.8 mm more. Worth ~0%.
- **More stack length.** Closing on length alone needs a 149.7 mm active stack
  inside a 140.5 mm housing. Doesn't fit.
- **More current.** This *does* close it — the machine is about 64% reluctance
  torque, so torque rises slightly faster than current, and 1.5× current makes
  125.5 N·m. **But it is inadmissible:** at a fixed speed, more torque is more
  power, and 1.5× torque at 19,500 rpm is 375 kW against a 250 kW cap. A power
  cap is also a torque cap at any given speed.
- **More speed.** This is the only lever that respects the power cap, because the
  torque required falls as speed rises.

## The results that close

Combining a moderate speed increase with a moderate stack increase, all inside
the existing housing. Rotor stress was solved at each speed rather than
estimated, against an assumed 355 MPa yield:

| speed | active stack | delivered / required | margin | axial space left | rotor factor of safety |
|---|---|---|---|---|---|
| 24,000 rpm | 130 mm | 108.8 / 101.7 N·m | **+7%** | 10.5 mm | **1.74** |
| 27,000 rpm | 120 mm | 100.4 / 90.4 N·m | **+11%** | 20.5 mm | 1.37 |
| 27,000 rpm | 110 mm | 92.1 / 90.4 N·m | +2% | 30.5 mm | 1.37 |
| 30,000 rpm | 97.6 mm (unchanged) | 81.6 / 81.4 N·m | +0.2% | 42.9 mm | 1.11 |

There is no single answer — it is a **trade between speed and axial space**:

- **Lower speed** gives a safer rotor and less iron loss, but needs a longer
  active stack, leaving less room for end windings, bearings and seals.
- **Higher speed** frees axial space but works the rotor harder and raises
  electrical frequency, and with it iron loss.

The 30,000 rpm row closes on the machine as-is with no stack change at all, but a
factor of safety of 1.11 is not something I would build on. My preference would
be around **24,000–27,000 rpm**, where the rotor has real margin — but that
choice depends on how much axial length is genuinely available for end windings
and bearings, which is exactly the kind of thing the interface document would
settle.

Either way the gear ratio rises from 8:1 to roughly 10–11:1, and electrical
frequency from 1,300 Hz to 1,600–1,800 Hz.

## The assumption that actually decides this

The 250 kW figure is published as a **cap** on regenerative power. I modelled it
as a **continuous** rating, which is the conservative reading.

That single choice sets the whole problem. The front unit's role in Gen3 is
energy recovery — braking events lasting seconds, not a continuous duty — and
Gen3 Evo adds only limited all-wheel-drive windows. If the real requirement is an
intermittent duty rather than a continuous rating, the thermal picture changes
entirely and so does the answer.

My analysis flagged this itself: it recorded that no braking-event profile, lap
duty cycle or permitted continuous duration was available, and that a continuous
thermal case therefore could not be closed from what I had.

## What I'd value from you

1. **Is 250 kW a continuous rating or a peak cap on an intermittent duty?** This
   is worth more than everything else combined.
2. **What speed does the real unit run to?** My 19,500 rpm is a guess, and the
   answer turns on it.
3. **Is the housing envelope roughly right?** If it's longer than I've assumed,
   the problem largely disappears.

## What this is not

This is a first-pass concept study. Nothing here is validated against hardware.
The thermal case is open — I sized cooling against an iron-loss figure I now
believe is significantly understated. Bearings, magnet retention and rotor
dynamics at raised speed are unexamined, and I've made no attempt at port
coordinates or mounting interfaces.

I'd rather show you where the analysis is uncertain than present it as more
finished than it is.
