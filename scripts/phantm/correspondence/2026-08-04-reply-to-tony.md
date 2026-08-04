# Reply to Tony — two outstanding notes

Tony,

Owed you a reply on both the tooth-spacing idea and your finite-element
results. Taking them in order, and the second one contains a correction to us.

## 1. Your every-other-tooth idea — don't abandon it

You talked yourself out of this too early. The concern was that with widely
spaced teeth you would end up with "teeth facing gaps" after three steps. **On
our model that does not happen at a 60 µm gap.** Fringing — the very thing that
hurts you at this gap — keeps the *effective* magnetic tooth wider than the iron
tooth, so a phase offset by a third of a pitch still has something to pull on.
Solved through the whole step travel, the force never reverses in any of the
variants below.

Where you were right is the geometry. Removing every other tooth doubles the
pitch while leaving the tooth width alone, so the duty falls from 0.40 to 0.20.
A three-phase machine offsets its poles by a third of a pitch, and a phase can
only make force if its tooth still partly overlaps a translator tooth — which
needs tooth width greater than pitch/3. At duty 0.20 the offset (208 µm)
exceeds the tooth (125 µm), so on pure geometry the energised phase sits over a
slot. That is exactly the failure you described.

It just doesn't play out that way once fringing is in the picture. At 60 µm,
0.35 A, 70 turns, taking force through the step travel rather than at its peak
(the peak flatters designs that have a weak spot elsewhere):

| Tooth scheme | Step | Force at step start | Minimum through travel | Mean |
|---|---|---|---|---|
| As drawn — pitch 312, tooth 125 | 104 µm | 2.01 mN | 0.31 mN | 1.72 mN |
| **Yours — every other tooth removed** | 208 µm | 1.26 mN | **0.60 mN** | **2.27 mN** |
| Scale tooth *and* slot, pitch 624 | 208 µm | **2.83 mN** | 0.48 mN | 2.37 mN |

Your version has the lowest starting force but the highest minimum and a 32%
better mean than the current design — a flatter, more uniform pull, which is
the useful property for completing a step. The third row is worth a look too:
if instead of deleting teeth you scale tooth *and* slot together, you keep the
duty at 0.40 and get the best of both.

The cost in all the coarse variants is resolution: the step goes from 104 to
208 µm, so the phase quantisation halves. That is your and Vlad's call, not
ours, and it is the thing most likely to kill the idea.

## 2. Your finite-element results — and where ours was wrong

Thank you for the plots; they did more than the numbers.

Running our model at your three conditions, we came out about five times below
you. That was far too big to leave, so I went looking, and your instinct about
plots is what found it. Rendering our own field showed the flux going *round*
the return limb instead of *through* the teeth: mean 0.084 T in the working gap
against 0.277 T in the bridge. Yours shows the opposite and the correct
behaviour.

The cause is ours. Our 2D model unrolled the horseshoe into the tooth plane —
the real bridge wraps transversely, so no single plane holds both — and the
straightened bridge ended up sitting close to the pole at a fifth of the real
limb thickness. It was acting as a magnetic short. Rebuilt with the return path
moved well away and made generously thick, **our 20 µm case now agrees with
yours to about 1%**.

So on absolute force I would take your numbers over ours for now.

**But we still disagree about something more important than the level.** After
the fix, we are *below* you at 60 µm and *above* you at 20 µm — which is not a
scaling error, it is a different curve:

- your figures give **1.65×** for closing 60 → 20 µm at fixed drive
- ours give about **6×**

That is precisely the number your manufacturing question rests on. If closing
the gap only buys 1.65× then a 20 µm gap is obviously not worth its tolerance
problem; if it buys 6× it might be. We have ruled out the obvious suspects on
our side — return path, pole slot depth, translator slot depth, drive scaling,
mesh — and none of them move it.

**The fastest way to settle this is to swap model files.** If you send a `.fem`
we will run it here, and we will send you ours. Then we are comparing two
solvers on one geometry rather than two geometries through two solvers, and
whichever of us is wrong finds out in an afternoon rather than by correspondence.

One thing worth checking at your end meanwhile: in a circuit where the two
working gaps dominate the reluctance, cutting the gap threefold should buy
appreciably more than 1.65×. If it doesn't, something else is absorbing the
ampere-turns — which is exactly the fault we just found in ours. Integrating
|H| from the coil, through the teeth and back would show where they are
actually being spent.

## 3. On the plots

Yes — attached, at your three conditions for direct comparison. We run the same
solver you do (FEMM 4.2's core) but headless from scripts, which is how the
parameter sweeps get done; there is no window to screenshot, so we sample the
solution on a grid and draw it. Colour is |B|, black lines are flux lines.

We have also now built a 3D magnetostatic capability and validated it against
closed-form cases, because the disagreement above is one that two 2D models of
an intrinsically non-planar circuit may not be able to settle between
themselves. That is the route to a real answer on the gap question if the file
swap doesn't converge.

---

*Attached: |B| field plots with flux lines at 60 µm / 0.35 A / 70 T, 20 µm /
0.35 A / 70 T, and 40 µm / 0.5 A / 90 T, all at dx = 78 µm.*
