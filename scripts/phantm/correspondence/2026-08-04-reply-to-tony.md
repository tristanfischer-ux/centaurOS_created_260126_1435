# Reply to Tony — two outstanding notes

Tony,

Owed you a reply on both the tooth-spacing idea and your finite-element
results. Taking them in order; the second contains a correction to us and an
honest account of what our model can and cannot currently settle.

## 1. Your every-other-tooth idea — don't abandon it

You talked yourself out of this too early. The concern was that with widely
spaced teeth you would end up with "teeth facing gaps" after three steps. **On
our model that does not happen at a 60 µm gap.** Fringing — the very thing that
hurts you at this gap — keeps the *effective* magnetic tooth wider than the iron
tooth, so a phase offset by a third of a pitch still has something to pull on.
Solved through the whole step travel, the force does not reverse in any of the
variants below.

Where you were right is the geometry. Removing every other tooth doubles the
pitch while leaving the tooth width alone, so the duty falls from 0.40 to 0.20.
A three-phase machine offsets its poles by a third of a pitch, and on pure
geometry a phase can only pull if its tooth still overlaps a translator tooth —
which needs tooth width greater than pitch/3. At duty 0.20 the offset (208 µm)
exceeds the tooth (125 µm), so geometrically the energised phase sits over a
slot. That is exactly the failure you described, and it is why the idea looks
dead on paper.

It doesn't play out that way once fringing is included. At 60 µm, 0.35 A, 70
turns, taking force through the step travel rather than at its peak — the peak
flatters designs that have a weak spot elsewhere:

| Tooth scheme | Step | At step start | Minimum through travel | Mean |
|---|---|---|---|---|
| As drawn — pitch 312, tooth 125 | 104 µm | 2.01 mN | 0.31 mN | 1.72 mN |
| **Yours — every other tooth removed** | 208 µm | 1.26 mN | **0.60 mN** | **2.27 mN** |
| Scale tooth *and* slot, pitch 624 | 208 µm | **2.83 mN** | 0.48 mN | 2.37 mN |

Your version has the lowest starting force but the highest minimum and a 32%
better mean than the current design — a flatter, more uniform pull, which is
the useful property for completing a step. The third row is worth a look too:
if instead of deleting teeth you scale tooth *and* slot together, you keep the
duty at 0.40 and get a better start force with almost the same mean.

Two caveats. These are *relative* comparisons at one gap, which is what our
model is best at and which survives the correction below; the absolute values
should not be leaned on. And the cost in all the coarse variants is resolution:
the step goes from 104 to 208 µm, so phase quantisation halves. That is your and
Vlad's call, and it is the thing most likely to kill the idea.

## 2. Your finite-element results — where ours was wrong, and what is still open

Thank you for the plots. They did more than the numbers did.

Running our model at your three conditions, we came out **between two and five
times below you** (ratios 0.20, 0.53, 0.18). That was too big to leave, and your
instinct about plots is what found it: rendering our own field showed flux going
*round* the return limb instead of *through* the teeth — 0.084 T in the working
gap against 0.277 T in the bridge. Yours shows the correct behaviour.

The cause was ours. Our 2D model unrolled the horseshoe into the tooth plane —
the real bridge wraps transversely, so no single plane holds both — and the
straightened bridge ended up close to the pole at a fifth of the real limb
thickness. It was acting as a magnetic short.

**What I can and cannot claim after fixing it.** Rebuilding with the return path
moved away and made thicker raises our forces substantially, but the answer
still depends on *how far* we idealise that return — and it depends most at the
small gap, where the gap reluctance is least dominant:

| Return-path idealisation | 60 µm | 20 µm | ratio |
|---|---|---|---|
| Modest | 1.52 mN | 7.89 mN | 5.2× |
| Strong | 2.22 mN | 12.90 mN | 5.8× |
| Ideal limit | 2.34 mN | 13.90 mN | 5.9× |
| **Your figures** | **4.16 mN** | **6.86 mN** | **1.65×** |

So I will not tell you our numbers now agree with yours. Depending on that one
modelling choice our 20 µm result sits anywhere from 1.15× to 2.0× your figure,
and picking the setting that happens to match yours would be meaningless. What
the table does show is that our model is **least converged exactly where the gap
is smallest** — which is unfortunate, because that is where your design decision
sits.

## 3. The disagreement that matters, stated properly

Set the absolute level aside. The two models disagree on **how much closing the
gap actually buys**, and that is the number your manufacturing question rests on.

There is a hard upper bound to check against. For an unsaturated circuit whose
two working gaps dominate the reluctance, flux goes as 1/g, so force goes as
1/g². Closing 60 → 20 µm is a threefold gap reduction, so the ideal ceiling is
**9×**. Fringing can only pull that down. Our figures land at 5–6×, comfortably
under the ceiling and consistent with heavy fringing at this gap-to-tooth ratio.
**Yours at 1.65× is far below what even a heavily-fringed two-gap circuit should
give**, and that is what I would want to understand before either of us designs
against it.

The check I would suggest at your end: integrate |H| along a path from the coil,
through the teeth and back round the return. If the two gaps are not taking the
large majority of the ampere-turns, something else is absorbing them — which is
exactly the fault we just found in our own model, and it would explain a
compressed gap sensitivity.

**The fastest way to settle this is to swap model files**, and ours are
attached. Run them in your FEMM; if your solver reproduces our numbers on our
geometry then the difference between us is dimensions, and we reconcile those in
an afternoon. If it does not, it is solver setup, which is shorter still.

**One caveat on our files, so the numbers reconcile.** They carry a deliberately
idealised return path and will not look like your actuator — the reasoning is in
the read-me. More practically: solving them gives raw single-position values of
−2.89, −13.65 and −15.54 mN, which are *not* the figures quoted above. Those raw
values include a constant offset from modelling a finite length of a periodic
structure, which we remove by averaging over a full pitch. If you divide the raw
20 and 60 µm values you get 4.7× rather than the 5.9× in the table — same
physics, different processing, and I would rather you heard that from me than
found it.

I should be straight about the standing of that idealised model: it is a clean
benchmark for comparing one tooth geometry against another, which is what
section 1 uses it for. It is **not** yet a validated representation of your
actuator's magnetic circuit, and I would not use it on its own to settle the
real 60-versus-20 µm decision. We have built and validated a 3D capability for
exactly that reason; if the file swap does not converge, that is the route to an
answer neither of our 2D models can give.

---

*Attached: three .fem files at your benchmark conditions with the scripts that
generated them, a read-me, and |B| field plots with flux lines at 60 µm /
0.35 A / 70 T, 20 µm / 0.35 A / 70 T and 40 µm / 0.5 A / 90 T, all at
dx = 78 µm.*
