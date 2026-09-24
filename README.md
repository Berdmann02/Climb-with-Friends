# Climb with Friends

A playable Three.js foundation for a cozy social climbing game. Build a route in **The Hearth**, a warm neighborhood climbing gym, or head to **Juniper Ridge** to climb, clip protection, handle a rope, and switch between climber and belayer.

The visual and movement goal is **“Stylized cozy climbing with believable movement.”** Compact, friendly characters contrast with warm wood, textured plywood, recognizable climbing equipment, and layered alpine granite. This is an approachable game prototype, not climbing instruction or a finished climbing simulation.

## Run locally

Requires Node.js 20.19+ or 22.12+ and a current WebGL-capable desktop browser.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Choose The Hearth or Juniper Ridge from the title screen. Click `?` for the field guide. Browser audio starts after a user interaction.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Browser integration checks use Playwright through `npm run test:browser`. The development server must be available when running browser checks; see `tools/playtest.mjs` for its URL and browser configuration.

## Controls

| Context | Input | Action |
| --- | --- | --- |
| Explore | WASD | Walk relative to camera |
| Explore | Shift | Jog |
| Camera | Hold right mouse and drag | Orbit / look up |
| Camera | Mouse wheel | Adjust camera distance |
| General | Escape | Pause |
| Gym | R / Set a route | Enter route workshop |
| Climb | E | Start or leave the wall |
| Climb | Q / W | Release and directly control left / right hand |
| Climb | A / S | Release and directly control left / right foot |
| Climb | Mouse movement | Continuously reach with the free limb |
| Climb | Left click | Grip the contacted hold, or plant a foot against the wall |
| Climb | Backspace | Release the selected limb |
| Developer | F3 | Toggle contact / center-of-mass overlay (off by default) |
| Outdoor climb | C | Clip a nearby quickdraw |
| Outdoor climb | X | Test a fall |
| Outdoor | Tab | Switch climber / belayer roles |
| Belay | F | Feed rope |
| Belay | G | Take slack |
| Belay | Space | Brake / catch |
| Belay | L | Lower partner |

Pressing a limb key removes its support immediately. The free hand or foot follows the mouse with damping and fixed anatomical limits; clicking only establishes contact if the limb has reached that surface. You can change direction before gripping, or switch limbs while leaving the previous limb detached. Attached contacts stay where you put them. Balance and body positioning update throughout the movement, with physical tension, slipping and falls instead of reach warnings. Right-drag orbits the camera without dragging the free target during the orbit.

The camera stays behind the belayer and looks up toward the climber. In local belayer mode the partner maintains the last limb intentions and remains subject to stability. Switch back to control their limbs; there is no automatic route progression. The climber sees a short harness strand and nearby protection, while the belayer sees the full rope path.

## Route workshop

1. Open the workshop in the gym.
2. Choose a jug, crimp, sloper, pinch, or foothold, and a color.
3. Click an empty part of the main wall to place it. Click an existing hold to select it; drag to reposition.
4. Use **R / Rotate**, **Delete**, and the size slider to adjust the selected hold. **Ctrl/Cmd Z** or **Undo** restores the previous edit.
5. Mark start holds and a finish hold, and give the route a name.
6. **Save route** stores it in this browser. The route shelf loads saved routes. **Export / Import** exchanges versioned route JSON files.
7. **Test climb** leaves the editor and uses that same route in the climbing controller.

Feet stay where you put them. Release a foot, move it to bare wall and click to attempt a smear. A free leg affects rotational balance continuously through its position, without a flag button. Rotated jugs behave as sidepulls or underclings, and the workshop’s grip selector allows an explicit grip character. No reachable holds or recommended moves are highlighted.

## Current prototype

- Two environments with intentionally different moods: a timber-and-plywood gym with a coffee corner, plants, cubbies, seating, shoes, gear, neighboring walls and crash pads; and a granite crag surrounded by evergreen forest, wildflowers and distant alpine ridges.
- Third-person exploration with smooth acceleration, turning, ground behavior, static collision volumes, and camera collision avoidance.
- Data-driven routes with editable holds, serialization, validation, local persistence and JSON interchange.
- Continuous four-limb climbing: release with Q/W/A/S, steer the free limb with the mouse, then click to grip. Each limb independently tracks contact, orientation, load and movement state; there is no timed move-to-hold sequence.
- Per-frame constrained body and hip positioning, damped body inertia, fixed-length two-bone IK, grip-specific fingers and wrist orientation, toe/sole contact, smearing and geometric flagging.
- Posture-dependent stability and arm strain throughout a reach, visible tension and trembling, a correction window, deterministic slipping and rope-caught falls. Moving a free limb back or establishing another contact can improve support before a fall.
- Exact hold-surface ray contacts with fingertip/toe clearance. Initial grip locations are sampled from the existing hold meshes; bolt and route tape decorations cannot become grip surfaces.
- A local climber/belayer pair, progressive quickdraw clipping, curved rope visualization, slack/tension feedback, fall/catch and lowering states. Rendered rope length depends on player role without changing the full logical rope path.
- A modular room transport experiment based on `BroadcastChannel`, validated gameplay snapshots, authority-owned route messages, and explicit interfaces. This is a foundation for local same-browser experiments; it is not internet multiplayer.
- Lightweight synthesized interaction audio and restrained UI.

## Architecture

| Folder | Responsibility |
| --- | --- |
| `src/core` | Shared data contracts, input, third-person camera and audio |
| `src/player` | Character geometry/posing and exploration controller |
| `src/climbing` | Mouse input, free-limb dynamics, contact/grip rules, continuous body pose and stability, IK, debug overlay and quickdraws |
| `src/routes` | Route schema validation, persistence, defaults, rendering and editor |
| `src/belay` | Belay actions, slack, catch and lowering state |
| `src/rope` | Full rope path state and role-dependent curved rope rendering |
| `src/world` | Gym/outdoor factories, materials, terrain, props and instanced vegetation |
| `src/assets` | Cached glTF loading |
| `src/network` | Meaningful state snapshots and transport boundary |
| `src/ui` | Menu, contextual controls, workshop and field guide |
| `tests` | Behavioral tests for gameplay/data helpers |
| `tools` | Blender generation recipe and development verification |

World factories return a `World`: scene group, collision boxes, camera obstacles, climbable wall bounds, spawn points, protection positions and an optional update callback. They do not own climbing or route editing. Route coordinates use meters; the main contact wall is local XY with +Z pointing out toward the climber. Saved holds include unique ID, model/type, position, rotation, scale, color, start/finish flags and wall ID.

The prototype uses Three.js, TypeScript, Vite, Vitest and Playwright. Static exploration collisions and a deterministic rope approximation keep this slice lightweight; Rapier is not currently required. An authoritative physics layer can be added behind the existing gameplay interfaces when moving beyond static worlds and local sessions.

`ClimbInput` projects pointer intent onto the surface. `LimbTargetController` integrates damped free-limb motion and enforces anatomical limits. `BodyPoseSolver` constrains the body around planted contacts; `StabilitySolver` evaluates support and torque each frame. `ClimbingController` owns attachment, slipping and fall handoff. `ContactSolver` resolves actual contact surfaces and grip transforms. Rope presentation is selected independently through `RopeController.setView()`.

## Assets and Blender pipeline

Custom models were authored and exported through the configured **Blender MCP** connection. The existing Blender scene was inspected and preserved. A separate prototype collection holds the new meshes.

| Custom asset | Purpose |
| --- | --- |
| `hold-jug.glb` | Organic jug with a rounded lip and recessed upper grip |
| `hold-crimp.glb` | Compact asymmetric rail |
| `hold-sloper.glb` | Broad rounded grip |
| `hold-pinch.glb` | Narrow vertical grip |
| `hold-foothold.glb` | Small rounded foot chip |
| `granite-boulder.glb` | Reusable irregular granite mass |
| `wall-volume.glb` | Triangular plywood climbing volume |

The five holds each have 320 authored vertices, the boulder 98, and the volume 4. Exports are in `public/assets`; `climbing-library.blend` is the editable source collection. `tools/create_assets.py` reproduces the meshes and GLB exports in Blender. Running it creates a new isolated collection and overwrites generated export files.

Assets use meters, +Y up, and +Z outward. Hold and volume origins are at the wall contact plane. Their neutral resin materials are tinted at runtime. Reusable canvas textures add wood grain, T-nuts, stone variation and fabric weave; environmental props use shared procedural builders. Evergreen forests, grass and flowers use instancing. No external asset packs are required.

## Scope and limitations

- Local play is the primary experience. There is no hosted room service, remote account system, matchmaking or production network authority.
- Belaying and falls are readable approximations. The rope is not a full collision-aware physical cable, and equipment is not a training model.
- Limbs use procedural posing, not authored motion-capture animation. Extreme custom route spacing can exceed reach or produce awkward transitions. Contact friction, balance and arm strain are tuned game approximations rather than a biomechanics simulation.
- The continuous-control refactor was implemented without running tests, builds, linting, type checks or gameplay passes, as requested. Existing discrete-movement checks predate this interaction model and need revision in a future verification pass. Mouse sensitivity, settling speed, recovery timing and wrist alignment still need hands-on tuning.
- Hold contact samples and simplified articulated fingers reuse the existing assets; there are no individually authored grip markers for every possible surface. Rope suppression crops a local curved strand rather than fading individual segments, and it does not yet use wall or camera collision.
- Main custom route surfaces are planar. Neighboring gym slabs/overhangs and outdoor rock features establish the visual direction, but arbitrary curved route surfaces are future work.
- Collision uses simple static volumes. Props are decorative and cannot yet be moved or physically manipulated.
- Gym ownership, full decoration tools, progression, cosmetics, additional mountains and a deep fatigue model are outside this slice.
- Routes are browser-local unless exported. Clearing browser data removes local saves.
- Desktop keyboard/mouse is the current target; mobile and gamepad controls are not implemented.

## Recommended next steps

1. In a separately authorized verification pass, update the previous discrete-movement checks and tune continuous mouse control, body response, correction windows and hand/foot alignment with climbers and new players.
2. Add an authoritative room server and test actual two-person climb/belay ownership before expanding progression.
3. Author playable slab/overhang routes against the existing surface-angle and friction contract; expand outdoor hand-grip zones and ledges.
4. Refine the character rig and add authored motion accents for clipping, resting, chalking and rope handling.
5. Introduce persistent gym layouts and a small furniture customization loop, then route browsing/sharing between friends.
6. Add collision-aware rope contacts, more outdoor route choices, spatial ambience and an expanded lighting/animation polish pass.
