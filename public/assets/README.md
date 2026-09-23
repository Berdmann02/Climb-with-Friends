# Climb Together asset library

All seven models were authored for this prototype through the connected Blender MCP server. The existing Blender scene was preserved; models live in a dedicated collection. No third-party assets or textures are included.

| Asset | Source vertices | Purpose |
| --- | ---: | --- |
| hold-jug.glb | 320 | Rounded lip with recessed gripping pocket |
| hold-crimp.glb | 320 | Compact asymmetric rail |
| hold-sloper.glb | 320 | Broad rounded palm contact |
| hold-pinch.glb | 320 | Narrow vertical grip |
| hold-foothold.glb | 320 | Small domed foot chip |
| granite-boulder.glb | 98 | Irregular faceted granite mass, reusable at several scales |
| wall-volume.glb | 4 | Triangular plywood volume |

`climbing-library.blend` contains editable meshes. `tools/create_assets.py` is the reproducible Blender recipe and exports GLBs without deleting existing scene objects. Re-running creates a new asset collection and overwrites the seven generated GLBs.

GLBs use meters, +Y up, and +Z outward from the wall. Hold and volume origins lie on the back contact plane. Holds use neutral resin for runtime tinting. Models use no external texture dependencies. The game generates reusable wood grain, plywood T-nuts, granite variation, woven fabric, and terrain textures in `src/world/materials.ts`.

The Blender source is kept alongside the exports for this prototype; a production deployment should publish only the GLBs.
