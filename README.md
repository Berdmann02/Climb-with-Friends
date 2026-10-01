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
| Reception | E | Open wall mood presets |
| Near a wall, facing it | E | Start that wall’s route |
| Near a gym wall, facing it | R | Edit that wall’s route |
| Resting on rope | E / L | Continue climbing / lower down |
| Climb | Q / W | Release and directly control left / right hand |
| Climb | A / S | Release and directly control left / right foot |
| Climb | Mouse movement | Continuously reach with the free limb |
| Climb | Left click | Attempt contact at the actual palm/toe, even when the mouse exceeds reach |
| Climb | Backspace | Release the selected limb |
| Developer | F3 | Toggle contact / center-of-mass overlay (off by default) |
| Outdoor climb | C | Clip a nearby quickdraw |
| Climb | X | Release into a rope fall or drop onto the bouldering mat |
| Roped climb | Tab | Switch climber / belayer roles |
| Outdoor rope bag | E | Belay the route partner |
| Belay | F | Feed rope |
| Belay | G | Take slack |
| Belay | Space | Brake / catch |
| Belay | L | Lower partner |

Pressing a limb key removes its support immediately. The free hand or foot follows the mouse with damping and fixed anatomical limits; clicking only establishes contact if the limb has reached that surface. You can change direction before gripping, or switch limbs while leaving the previous limb detached. Secure contacts stay where you put them. Bare-wall palms provide only weak bracing; excess shear and outward pulling make them slide and release. Balance and body positioning update throughout the movement, with physical tension, slipping and falls instead of reach warnings. Right-drag orbits the camera without dragging the free target during the orbit.

The camera stays behind the belayer and looks up toward the climber. Outdoors, approach the open rope bag and press E to belay the sole route partner. Your character walks into stance while the partner climbs with the same continuous limb/body solver. F feeds, G takes, Space brakes, and L lowers. The bag holds a route/climber/belayer reservation until the session ends. Tab retains the existing role switch during your own roped climb. The climber sees a short harness strand and nearby protection, while the belayer sees the full rope path.

## Route workshop

1. Approach and face a gym wall, then press **R** when its small prompt appears. The left lane is **BOULDER**; the taller right lane is **TOP ROPE**.
2. Choose a jug, crimp, sloper, pinch, or foothold, and a color.
3. Click an empty part of the selected wall to place it. Click an existing hold to select it; drag to reposition.
4. Use **R / Rotate**, **Delete**, and the size slider to adjust the selected hold. **Ctrl/Cmd Z** or **Undo** restores the previous edit.
5. Mark start holds and one finish hold with room for both hands, and give the route a name.
6. **Save route** stores it in this browser. The route shelf loads saved routes. **Export / Import** exchanges versioned route JSON files.
7. **Test climb** leaves the editor and uses that same route in the climbing controller.

Feet stay where you put them. Release a foot, move it to bare wall and click to attempt a smear. A free leg affects rotational balance continuously through its position, without a flag button. Rotated jugs behave as sidepulls or underclings, and the workshop’s grip selector allows an explicit grip character. No reachable holds or recommended moves are highlighted.

## Climbing modes and flow

| Mode | Location | Equipment | After a fall | Finish |
| --- | --- | --- | --- | --- |
| BOULDER | Short left gym lane | Padded mat; no rope, belayer or quickdraws | Gravity drop, height-dependent landing and standing recovery | Match both hands, pause, then manually down-climb or press X to drop |
| TOP_ROPE | Tall right gym lane | Harness, fixed top anchor, belayer | Remain hanging; E continues, L lowers | Match both hands, one-second hold, automatic gradual lowering |
| LEAD | Juniper Ridge | Rope and progressively clipped quickdraws | Hang from the last clipped protection; E continues, L lowers | Match both hands, transfer to the final lower-off, automatic gradual lowering |

Gym completion requires two secure, separated hand contacts on the **same** designated finish hold. Outdoors, establish both hands on usable rock at the lower-off bedding seam near the anchor. A single hand does not finish a route. Returning from a rope rest keeps the caught position: the body approaches the wall, the rope supports it, and the player reconnects every limb manually. The rope support ends after hands and a foot establish a sustainable stance. A fall before the first outdoor clip reaches the ground rather than creating a fictional overhead catch.

The reception counter near the gym entrance opens the three existing wall-color moods. A border and check mark identify the applied mood and remain correct when reopening the dialog or returning to the cached gym. Wall interactions are gated by distance and facing. Normal climbing shows only meters and a compact Q/W/A/S wheel; small prompts appear for available physical actions. The old route/session cards, footer slogan, Start Climbing card, and multiplayer badge have been removed.

The outdoor cliff is one continuous granite mesh with broad slabs/corners, embedded bedding rails, flakes, pockets, fracture grooves and fine roughness. Outdoor route holds are not rendered or used for contact. Hand and foot sampling interpolates the exact visible mesh triangles and derives hidden grip categories, friction and strength from their slope, edge depth and curvature. Smooth patches allow weak palms or foot smears. No feature highlights or route suggestions are shown. The visible central rock face is climbable across its width, including beyond the lead route corridor.

## Current prototype

- Two environments with intentionally different moods: a timber-and-plywood gym with a coffee corner, plants, cubbies, seating, shoes, gear, neighboring walls and crash pads; and a granite crag surrounded by evergreen forest, wildflowers and distant alpine ridges.
- Third-person exploration with smooth acceleration, turning, ground behavior, static collision volumes, and camera collision avoidance.
- Data-driven routes with editable holds, wall-owned BOULDER / TOP_ROPE / LEAD metadata, serialization, validation, local persistence and JSON interchange. Legacy version-one saves infer mode from their wall ID; incompatible locations/modes are rejected.
- Continuous four-limb climbing: release with Q/W/A/S, steer the free limb with the mouse, then click to grip. Hold Space to straighten the supporting legs and stand as high as the planted contacts allow. Tapping still selects/releases the limb. Each limb independently tracks contact, orientation, load and movement state; there is no timed move-to-hold sequence.
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
| `src/climbing` | Free-limb dynamics, contact/grip rules, continuous body/stability, IK, boulder landings, matched finish timing and quickdraws |
| `src/routes` | Route schema validation, persistence, defaults, rendering and editor |
| `src/belay` | Shared top-rope/lead session, belay actions, catch/rest/re-engagement and lowering |
| `src/systems` | Proximity/facing-gated wall and reception interactions |
| `src/rope` | Full rope path state and role-dependent curved rope rendering |
| `src/world` | Gym/outdoor factories, materials, terrain, props and instanced vegetation |
| `src/assets` | Cached glTF loading |
| `src/network` | Meaningful state snapshots and transport boundary |
| `src/ui` | Menu, contextual controls, workshop and field guide |
| `tests` | Behavioral tests for gameplay/data helpers |
| `tools` | Blender generation recipe and development verification |

World factories return a `World`: scene group, collision boxes, camera obstacles, typed climbable walls, reception position, spawn points, anchors/protection and an optional update callback. They do not own climbing or route editing. Route coordinates use meters; the main contact wall is local XY with +Z pointing out toward the climber. Saved holds include unique ID, model/type, position, rotation, scale, color, start/finish flags and wall ID.

The prototype uses Three.js, TypeScript, Vite, Vitest and Playwright. Static exploration collisions and a deterministic rope approximation keep this slice lightweight; Rapier is not currently required. An authoritative physics layer can be added behind the existing gameplay interfaces when moving beyond static worlds and local sessions.

`ClimbInput` projects pointer intent onto the surface. `LimbTargetController` integrates damped free-limb motion and enforces anatomical limits. `BodyPoseSolver` constrains the body around planted contacts; `StabilitySolver` evaluates support and torque each frame. `ClimbingController` owns attachment, slipping and fall handoff. `ContactSolver` resolves actual contact surfaces and grip transforms. Rope presentation is selected independently through `RopeController.setView()`. `WorldInteractions` gates access at physical locations, `ClimbFinishController` owns the success pause, and `BoulderController` owns drops and mat recovery. `GripResolver` queries a configurable 7 cm neighborhood around the rendered palm/toe; cursor projection supplies intent only. `WallContactResolver` integrates friction overload into sliding distance. `NaturalRockSurface` builds the cohesive cliff and samples its exact triangle topology. `PartnerClimbController` supplies private limb intentions for the route partner, and `BelayInteraction` owns the rope reservation.

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

This interaction/mode pass reuses the existing Blender assets. The reception counter, anchor hardware, and natural contact features are created with reusable Three.js geometry and existing material builders; no Blender files were rebuilt.

Assets use meters, +Y up, and +Z outward. Hold and volume origins are at the wall contact plane. Their neutral resin materials are tinted at runtime. Reusable canvas textures add wood grain, T-nuts, stone variation and fabric weave; environmental props use shared procedural builders. Evergreen forests, grass and flowers use instancing. No external asset packs are required.

## Scope and limitations

- Local play is the primary experience. There is no hosted room service, remote account system, matchmaking or production network authority.
- Belaying and falls are readable approximations. The rope is not a full collision-aware physical cable, and equipment is not a training model.
- Limbs use procedural posing, not authored motion-capture animation. Extreme custom route spacing can exceed reach or produce awkward transitions. Contact friction, balance and arm strain are tuned game approximations rather than a biomechanics simulation.
- This development pass was implemented without tests, builds, linting, type checks, browser automation or gameplay runs, as requested. No test files or infrastructure were changed. Manual tuning should focus on the 7 cm contact radius, palm friction/slip distance, natural-rock grip thresholds, partner pacing/recovery, rope catches and cliff performance.
- Hold contact samples and simplified articulated fingers reuse the existing assets; there are no individually authored grip markers for every possible surface. Rope suppression crops a local curved strand rather than fading individual segments, and it does not yet use wall or camera collision.
- The gym currently exposes two editable lanes on the existing wall, with fixed modes. Neighboring faces remain decorative. Outdoor contact uses a cohesive heightfield, supporting flakes, lips and local undercling normals but not caves or fully enclosed 3D crack systems. The body solver retains a shared wall basis with sampled torso clearance rather than full curved-surface traversal. Rope reservations are local with an authority synchronization hook; network-wide arbitration still needs a room server.
- Boulder recovery uses three procedural landing envelopes, not a full ragdoll or an authored tumble rig. Top-outs, crash-mat deformation and injury simulation are outside scope. Finishing lead routes automatically transfers to the terminal lower-off; detailed anchor cleaning is not simulated.
- Collision uses simple static volumes. Props are decorative and cannot yet be moved or physically manipulated.
- Gym ownership, full decoration tools, progression, cosmetics, additional mountains and a deep fatigue model are outside this slice.
- Routes are browser-local unless exported. Clearing browser data removes local saves.
- Desktop keyboard/mouse is the current target; mobile and gamepad controls are not implemented.

## Recommended next steps

1. In a separately authorized verification pass, update the previous discrete-movement checks and tune continuous mouse control, body response, correction windows and hand/foot alignment with climbers and new players.
2. Add an authoritative room server and test actual two-person climb/belay ownership before expanding progression.
3. Author playable slab/overhang routes against the existing surface-angle and friction contract; tune natural-rock topology and contact thresholds.
4. Refine the character rig and add authored motion accents for clipping, resting, chalking and rope handling.
5. Introduce persistent gym layouts and a small furniture customization loop, then route browsing/sharing between friends.
6. Add collision-aware rope contacts, more outdoor route choices, spatial ambience and an expanded lighting/animation polish pass.
