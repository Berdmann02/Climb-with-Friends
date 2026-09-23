"""Reusable Blender asset recipe; run through Blender MCP or Blender's Python console.

Only adds a dedicated collection. Existing objects are preserved. GLBs export in
Three.js coordinates: local X right, Y up, Z out from the wall, origin at back.
"""
import bpy, math, os, random

OUTPUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets')
os.makedirs(OUTPUT, exist_ok=True)
collection = bpy.data.collections.new('Climb Together • prototype asset library')
bpy.context.scene.collection.children.link(collection)

def material(name, color, roughness=.76, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return mat

resin = material('hold resin • tint at runtime', (.82,.87,.84))
stone = material('alpine granite', (.43,.47,.45), .91)
wood = material('birch plywood', (.63,.43,.24), .78)

def mesh(name, verts, faces, mat, smooth=True):
    # Three coordinates -> Blender coordinates. glTF reverses this conversion.
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x,-z,y) for x,y,z in verts], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = smooth
    return obj

def export(obj, filename):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT,filename), export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT')
    obj.location.x += len(exports) * .65 + 4
    exports.append({'file':filename, 'vertices':len(obj.data.vertices), 'polygons':len(obj.data.polygons)})

exports=[]
for kind,w,h,d in [('jug',.35,.25,.20),('crimp',.30,.105,.10),('sloper',.34,.29,.17),('pinch',.18,.30,.15),('foothold',.17,.105,.085)]:
    verts=[]; faces=[]; n=32; rings=10
    for j in range(rings):
        t=j/(rings-1)
        radius=max(.015, math.cos(t*math.pi*.5))
        for i in range(n):
            a=i*2*math.pi/n
            organic=1+.085*math.sin(a*3+.7)+.035*math.cos(a*5)
            x=math.cos(a)*w*.5*radius*organic
            y=math.sin(a)*h*.5*radius*organic
            z=d*math.sin(t*math.pi*.5)
            if kind=='jug':
                # Rounded lip and recessed upper pocket; broad lower grip.
                z-=.078*math.exp(-((x/.105)**2+((y-.039)/.061)**2))*math.sin(t*math.pi*.5)
                y+=.013*math.sin(t*math.pi)
            elif kind=='crimp': z*=.76+.24*(1-math.sin(a))
            elif kind=='pinch': x+=.013*math.sin(t*4)
            verts.append((x,y,z))
    for j in range(rings-1):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n
            faces.append((a,b,b+n,a+n))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((rings-1)*n+i for i in range(n)))
    obj=mesh('hold-'+kind,verts,faces,resin)
    export(obj,'hold-'+kind+'.glb')

# A stratified granite boulder with a low-poly silhouette but smooth broad faces.
random.seed(41)
verts=[]; faces=[]; n=14; levels=7
for j in range(levels):
    t=j/(levels-1)
    r=math.sin(.16+t*math.pi*.89)
    for i in range(n):
        a=i*2*math.pi/n
        rough=1+.14*math.sin(a*3+j*.4)+random.uniform(-.06,.06)
        verts.append((math.cos(a)*r*rough, t*1.7, math.sin(a)*r*.75*rough))
for j in range(levels-1):
    for i in range(n):
        a=j*n+i; b=j*n+(i+1)%n
        faces.append((a,b+n,b)); faces.append((a,a+n,b+n))
faces.append(tuple(range(n)))
faces.append(tuple((levels-1)*n+i for i in reversed(range(n))))
export(mesh('granite-boulder',verts,faces,stone,False),'granite-boulder.glb')

verts=[(-.7,-.6,0),(.75,-.55,0),(.1,.75,0),(-.22,-.08,.5)]
faces=[(0,2,1),(0,1,3),(1,2,3),(2,0,3)]
export(mesh('wall-volume',verts,faces,wood,False),'wall-volume.glb')

# Save an editable asset-only library, without changing the user's open file.
bpy.data.libraries.write(os.path.join(OUTPUT,'climbing-library.blend'), {collection}, fake_user=True)
result={'assets':exports, 'output':OUTPUT, 'collection':collection.name}
