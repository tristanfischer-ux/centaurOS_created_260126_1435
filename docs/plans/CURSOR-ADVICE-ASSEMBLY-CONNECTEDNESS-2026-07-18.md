# Cursor Advisory — Assembly Connectedness Before Composer Wiring

**Date:** 2026-07-18 ~15:23 BST  
**Authority:** Claude terminal implements; Cursor advises

## Recommendation

Prioritise the connectedness invariant first because it is a small, universal
guard that immediately kills floating-module/harness regressions.

Then wire the composer into Blender. Connectedness alone does not cure generic
forms; it only prevents disconnected ones.

```text
Work block A: attachment graph + proveCatch
Work block B: richer composer relations/fields/repetition
Work block C: composer placements → Blender objects
Work block D: measured delivered form/attachment proof
```

---

## Do not define connectedness as proximity

Two boxes within 1 mm are not necessarily assembled.

Every visible object/group needs:

- functional role;
- owning assembly;
- attachment type;
- attachment endpoints/contact region;
- whether removable;
- service/removal direction.

```py
class AssemblyNode:
    object_id: str
    functional_role: str
    assembly_id: str
    removable: bool
    mass_role: str

class Attachment:
    from_id: str
    to_id: str
    kind: str
    endpoint_a_mm: tuple[float, float, float]
    endpoint_b_mm: tuple[float, float, float]
    tolerance_mm: float
    intentional_detached: bool = False
```

Attachment kinds:

```text
fastened
bonded
press_fit
hinged
sliding
supported_by
nested_accessory
electrical_cable
fluid_tube
optical_alignment
external_lead
```

---

## Assembly graph invariants

### Primary structure

Every non-accessory physical role must connect by a valid attachment path to the
assembly root/chassis.

```text
connected_component_count(primary assembly) = 1
```

### Routed interconnects

Cable/tube endpoints must terminate on connector/interface objects:

```text
distance(curve.start, connector_A.datum) ≤ tolerance
distance(curve.end, connector_B.datum) ≤ tolerance
```

No zero-length, mid-air or shell-penetrating route without a grommet/channel.

### Mechanisms

- hinge child must share hinge axis;
- lead screw endpoints must touch motor/coupler and bearing/nut;
- guide rails must have supports;
- syringe/plunger must be constrained by cradle/clamp;
- microscope actuator must terminate on a flexure contact.

### Sample interfaces

- cuvette rests in well;
- vial rests in nest;
- cartridge engages connector/latches;
- tube sits in thermal well;
- slide rests on stage.

### Support

The product itself must connect to ground through feet/base in product views.
Nothing may float because its parent transform was lost.

---

## Legitimately detached objects

Do not false-fail:

- parked colorimeter cap;
- removable EWOD cartridge before insertion;
- external electrode leads;
- syringe consumables;
- service panel shown exploded in a service view.

These require explicit relations:

```text
nested_accessory(cap, cap_nest)
removable_interface(cartridge, cartridge_connector)
external_lead(electrode_clip, panel_connector)
exploded_for_view(panel, assembly_root, view=service)
```

Detached without declared purpose remains an orphan.

---

## Delivered proof

Write:

```json
{
  "schema": "assembly-connectedness-proof/v1",
  "root": "product_root",
  "nodes": [],
  "attachments": [],
  "primary_component_count": 1,
  "declared_detached_groups": [],
  "orphan_objects": [],
  "route_endpoint_failures": [],
  "mechanism_failures": [],
  "ok": true
}
```

Compute this from actual Blender transforms/curves after containment/parenting,
not from planned state.

---

## Code suggestions

Add:

```text
scripts/lib/assembly_connectedness.py
```

Functions:

```py
build_attachment_graph(blender_objects, form_contract)
measure_attachment(attachment, objects)
find_orphan_groups(graph)
audit_route_endpoints(curves, connector_datums)
audit_mechanism_relations(graph)
write_connectedness_proof(out_dir)
```

In `build_universal_scene.py`:

- tag objects with `functional_role`, `assembly_id`, `attachment_role`;
- register attachment datums when objects are created;
- register curve endpoints when harness/tube routes are created;
- run audit after all parenting/clamping and before render.

In drawing/Excel gates:

- orphan primary object → Renders/Assembly cap ≤4;
- route endpoint failure → connectedness FAIL;
- intentionally detached declared accessory → PASS with basis.

---

## proveCatch

Known bad:

- prior floating lab-electronics module;
- harness stopping in mid-air;
- detached NinjaPCR knob lobes;
- Poseidon rods with no endpoints;
- OpenFlexure condenser floating above tower.

Known good:

- colorimeter cap parked in nest;
- EWOD cartridge engaged in connector;
- Rodeostat external electrode leads;
- service panel intentionally exploded only in service view.

The gate is real only when every known bad fires and every intentional-detached
fixture remains silent.

---

## Composer integration warning

Do not wire the current solver directly into Blender as “finished convergent
evolution.”

Current implementation still needs:

- explicit relations/physical fields;
- repeated-role expansion;
- more than two candidates;
- measured hard culling;
- Pareto/lexicographic fitness;
- actual delivered proof.

Use connectedness as the first enforcement layer while improving the composer,
then have the composer emit attachment relations consumed by Blender.

