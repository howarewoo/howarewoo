"""Build editable desk props and web GLBs. Run with Blender --background --python.
All models are authored in XY with Z up. glTF exports use standard Y up.
The browser rotates each loaded model back into the desk's XY coordinate system.
"""
from pathlib import Path
import math
import shutil
import subprocess
import random
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
SOURCE = ROOT / 'assets/blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
# Pillow stays outside Blender's bundled Python; uv uses the script's pinned dependency.
uv_binary = shutil.which('uv') or '/opt/homebrew/bin/uv'
subprocess.run([uv_binary, 'run', '--script',
                str(ROOT / 'scripts/build_mat_texture.py')], check=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
DECODERS = ROOT / 'public/draco'
DECODERS.mkdir(parents=True, exist_ok=True)
for filename in ['draco_decoder.wasm', 'draco_wasm_wrapper.js']:
    shutil.copyfile(ROOT / 'node_modules/three/examples/jsm/libs/draco/gltf' / filename, DECODERS / filename)
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 32
rng = random.Random(73)


def build_butcher_block():
    """Assemble staggered, tightly glued strips from the natural Wood095 scan."""
    width, height, strip = 2048, 1280, 64
    randomizer = random.Random(95)
    blocks = []
    for y in range(0, height, strip):
        x = -randomizer.randint(80, 430)
        while x < width:
            length = randomizer.randint(320, 620)
            blocks.append((x, y, length, randomizer.random(), randomizer.random(), randomizer.uniform(.86, 1.06)))
            x += length
    for source, output, normal_map in [
        ('wood-source.jpg', 'wood.jpg', False),
        ('wood-source-normal.jpg', 'wood-normal.jpg', True),
    ]:
        image = bpy.data.images.load(str(SOURCE / 'textures' / source))
        image.colorspace_settings.name = 'Non-Color'
        sw, sh = image.size
        pixels = np.empty(sw * sh * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(sh, sw, 4)
        assembled = np.ones((height, width, 4), dtype=np.float32)
        for x, y, length, u, v, tone in blocks:
            sx, sy = int(u * (sw-length)), int(v * (sh-strip))
            tile = pixels[sy:sy+strip, sx:sx+length].copy()
            if normal_map:
                tile[0, :, 1] = .47
                tile[:, 0, 0] = .47
            else:
                tile[:, :, :3] *= tone
                tile[0, :, :3] *= .96
                tile[:, 0, :3] *= .91
            start, end = max(0, x), min(width, x+length)
            assembled[y:y+strip, start:end] = tile[:, start-x:end-x]
        result = bpy.data.images.new('Natural butcher block ' + output, width=width, height=height)
        result.colorspace_settings.name = 'Non-Color'
        result.pixels.foreach_set(np.clip(assembled, 0, 1).ravel())
        result.filepath_raw = str(ROOT / 'public/textures' / output)
        result.file_format = 'JPEG'
        result.save()
        if not normal_map:
            # Let pores and glue lines modulate a matte oil finish without flattening the scan.
            luminance = (assembled[:, :, 0] * .2126
                         + assembled[:, :, 1] * .7152
                         + assembled[:, :, 2] * .0722)
            roughness = np.clip(.68 - (luminance - luminance.mean()) * .18, .60, .78)
            roughness_pixels = np.ones_like(assembled)
            roughness_pixels[:, :, :3] = roughness[:, :, None]
            roughness_image = bpy.data.images.new(
                'Natural butcher block wood-roughness.jpg', width=width, height=height
            )
            roughness_image.colorspace_settings.name = 'Non-Color'
            roughness_image.pixels.foreach_set(roughness_pixels.ravel())
            roughness_image.filepath_raw = str(ROOT / 'public/textures/wood-roughness.jpg')
            roughness_image.file_format = 'JPEG'
            roughness_image.save()
            bpy.data.images.remove(roughness_image)
        bpy.data.images.remove(image)
        bpy.data.images.remove(result)


build_butcher_block()


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, color, roughness=.65, metallic=0, specular=.4):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    rgb = tuple(linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4))
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    specular_input = shader.inputs.get('Specular IOR Level') or shader.inputs.get('Specular')
    if specular_input:
        specular_input.default_value = specular
    return mat


def micro_surface(mat, scale, normal_strength, roughness, variation, profile, seed):
    """Bake restrained, material-specific normal and roughness maps for glTF."""
    n = 256
    rand = np.random.default_rng(seed)
    noise = rand.standard_normal((n, n)).astype(np.float32)
    if profile == 'fiber':
        # Long cellulose strands with a little cross-fiber pulp, not generic speckle.
        heights = sum(np.roll(noise, offset, 1) for offset in range(-5, 6)) / 11
        heights += .14 * sum(np.roll(noise, offset, 0) for offset in range(-1, 2)) / 3
    elif profile == 'weave':
        yy, xx = np.mgrid[:n, :n]
        heights = .18 * noise + np.sin(xx * math.pi / 3) + np.sin(yy * math.pi / 3)
    elif profile == 'brushed':
        # Drawn-out parallel machining marks keep nickel distinct from molded ABS.
        heights = sum(np.roll(noise, offset, 0) for offset in range(-10, 11)) / 21
    else:
        # Fine eggshell/orange-peel texture with no broad distressed modulation.
        heights = (noise + np.roll(noise, 1, 0) + np.roll(noise, -1, 0)
                   + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)) / 5
    heights -= heights.mean()
    heights /= max(heights.std(), 1e-6)

    dx = (np.roll(heights, -1, 1) - np.roll(heights, 1, 1)) * normal_strength
    dy = (np.roll(heights, -1, 0) - np.roll(heights, 1, 0)) * normal_strength
    normals = np.stack((-dx, -dy, np.ones_like(dx)), axis=2)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    normal_pixels = np.ones((n, n, 4), dtype=np.float32)
    normal_pixels[:, :, :3] = normals * .5 + .5

    roughness_values = np.clip(roughness + heights * variation, .04, 1)
    roughness_pixels = np.ones((n, n, 4), dtype=np.float32)
    roughness_pixels[:, :, :3] = roughness_values[:, :, None]

    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (*scale, 1)
    uv = nodes.new('ShaderNodeTexCoord')
    links.new(uv.outputs['UV'], mapping.inputs[0])
    for suffix, pixels, socket in [
        ('normal', normal_pixels, 'Normal'),
        ('roughness', roughness_pixels, 'Roughness'),
    ]:
        image = bpy.data.images.new(f'{mat.name} {suffix}', width=n, height=n)
        image.colorspace_settings.name = 'Non-Color'
        image.pixels.foreach_set(pixels.ravel())
        image.pack()
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.interpolation = 'Linear'
        links.new(mapping.outputs[0], texture.inputs[0])
        if socket == 'Normal':
            normal = nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value = 1
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
        else:
            links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Roughness'])


leather = material('Worn matte black leather', '222426', .82, specular=.32)
nodes, links = leather.node_tree.nodes, leather.node_tree.links
mapping = nodes.new('ShaderNodeMapping')
mapping.inputs['Scale'].default_value = (2.4, 2.4, 1)
uv = nodes.new('ShaderNodeTexCoord')
links.new(uv.outputs['UV'], mapping.inputs[0])

# Preserve the scan's pores and creases in color, not just specular highlights.
source_image = bpy.data.images.load(str(SOURCE / 'textures/leather-color-source.jpg'))
source_image.colorspace_settings.name = 'Non-Color'
source_image.scale(512, 512)
pixels = np.empty(512 * 512 * 4, dtype=np.float32)
source_image.pixels.foreach_get(pixels)
pixels = pixels.reshape(512, 512, 4)
luminance = pixels[:, :, 0] * .2126 + pixels[:, :, 1] * .7152 + pixels[:, :, 2] * .0722
low, high = np.quantile(luminance, [.05, .95])
grain = np.clip((luminance - low) / (high - low), 0, 1)
base = np.array(nodes.get('Principled BSDF').inputs['Base Color'].default_value[:3])
color = base * (.55 + .95 * grain[:, :, None])
pixels[:, :, :3] = np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)
pixels[:, :, 3] = 1
bpy.data.images.remove(source_image)
image = bpy.data.images.new('Scanned matte black leather color', width=512, height=512)
image.colorspace_settings.name = 'sRGB'
image.pixels.foreach_set(pixels.ravel())
image.pack()
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
links.new(mapping.outputs[0], texture.inputs[0])
links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])

for filename, socket in [('leather-normal.jpg', 'Normal'), ('leather-roughness-matte.png', 'Roughness')]:
    image = bpy.data.images.load(str(SOURCE / 'textures' / filename))
    image.colorspace_settings.name = 'Non-Color'
    image.scale(512, 512)
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    links.new(mapping.outputs[0], texture.inputs[0])
    if socket == 'Normal':
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .45
        links.new(texture.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
    else:
        links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Roughness'])

paper = material('Uncoated warm paper', 'e8e0cc', .92, specular=.27)
micro_surface(paper, (3.2, 5.5), .018, .92, .025, 'fiber', 41)
paper_edge = material('Paper end grain', 'c9c1ae', .96, specular=.24)
foil = material('Worn champagne foil', 'b8a574', .48, .55, .42)
elastic = material('Woven charcoal elastic', '232825', .93, specular=.28)
micro_surface(elastic, (3.5, 3.5), .065, .93, .025, 'weave', 43)
plastic = material('Fine textured charcoal ABS', '303332', .72, specular=.34)
micro_surface(plastic, (4.0, 4.0), .022, .72, .035, 'eggshell', 47)
plastic_edge = material('ABS recessed edge', '1e2422', .79, specular=.30)
metal = material('Brushed nickel', 'aeb4b2', .36, .9, .46)
micro_surface(metal, (1.4, 4.8), .014, .36, .045, 'brushed', 53)
kraft = material('Natural fibrous kraft paper', 'b8a383', .94, specular=.25)
micro_surface(kraft, (2.6, 5.0), .025, .94, .025, 'fiber', 59)
kraft_fold = material('Kraft folded edge', 'a99577', .96, specular=.23)
micro_surface(kraft_fold, (2.6, 5.0), .020, .96, .015, 'fiber', 59)
wax = material('Restrained oxblood sealing wax', '683e33', .58, specular=.40)
micro_surface(wax, (2.2, 2.2), .012, .58, .035, 'eggshell', 61)
mat_rubber = material('Matte self healing vinyl', '0c775d', .86, specular=.29)
micro_surface(mat_rubber, (2.0, 2.0), .015, .86, .025, 'eggshell', 67)

# MacBook finishes stay restrained: the unibody reads as bead-blasted aluminum,
# while the display is the only self-lit surface.
macbook_aluminum = material('MacBook space-black anodized aluminum', '636469', .36, 1, .44)
macbook_trackpad = material('MacBook etched graphite glass trackpad', '393a3e', .48, 0, .38)
macbook_well = material('MacBook recessed keyboard well', '101113', .64, specular=.32)
macbook_key = material('MacBook charcoal keycaps', '191a1c', .52, specular=.30)
macbook_legend = material('MacBook key legends', 'dedfe2', .72, specular=.25)
macbook_touch_id = material('MacBook Touch ID key', '17181a', .40, specular=.38)
macbook_bezel = material('MacBook display bezel', '07080a', .22, specular=.48)
macbook_camera = material('MacBook camera glass', '07111d', .18, specular=.56)
macbook_hinge = material('MacBook graphite hinge', '333439', .38, 1, .42)

# A compact baked dot field gives the speaker grilles real perforation scale
# without hundreds of separate hole meshes.
speaker_pixels = np.ones((512, 64, 4), dtype=np.float32)
speaker_pixels[:, :, :3] = np.array([.38, .39, .41], dtype=np.float32)
speaker_y, speaker_x = np.mgrid[:512, :64]
speaker_holes = ((speaker_x % 6 - 3) ** 2 + (speaker_y % 6 - 3) ** 2) < 1.8
speaker_pixels[speaker_holes, :3] = .025
speaker_image = bpy.data.images.new('MacBook speaker perforation field', width=64, height=512)
speaker_image.colorspace_settings.name = 'sRGB'
speaker_image.pixels.foreach_set(speaker_pixels.ravel())
speaker_image.pack()
macbook_speaker = material('MacBook speaker perforations', '636469', .36, 1, .44)
speaker_nodes = macbook_speaker.node_tree.nodes
speaker_texture = speaker_nodes.new('ShaderNodeTexImage')
speaker_texture.image = speaker_image
macbook_speaker.node_tree.links.new(
    speaker_texture.outputs['Color'], speaker_nodes.get('Principled BSDF').inputs['Base Color']
)

# Original monochrome sculptural wallpaper: broad rounded bands with directional
# surface shading, not a blurry glow. This is not a texture from the paid model.
wall_h, wall_w = 660, 1024
wall_y, wall_x = np.mgrid[0:1:complex(wall_h), 0:1.54:complex(wall_w)]
wallpaper = np.ones((wall_h, wall_w, 4), dtype=np.float32)
shade = np.full((wall_h, wall_w), .014, dtype=np.float32)
path = [(-.2, .84), (.78, .84)]
def wallpaper_arc(cx, cy, radius, start, end):
    for angle in np.linspace(math.radians(start), math.radians(end), 25)[1:]:
        path.append((cx+radius*math.cos(angle), cy+radius*math.sin(angle)))
wallpaper_arc(.78, .68, .16, 90, -90)
path.append((.40, .52))
wallpaper_arc(.40, .34, .18, 90, 270)
path.append((1.06, .16))
wallpaper_arc(1.06, .32, .16, 270, 360)
path.append((1.22, .88))
wallpaper_arc(1.39, .88, .17, 180, 0)
path.append((1.56, .40))
wallpaper_arc(1.72, .40, .16, 180, 270)
path.append((1.9, .24))
nearest = np.full_like(wall_x, np.inf)
dx = np.zeros_like(wall_x); dy = np.zeros_like(wall_y)
for (ax, ay), (bx, by) in zip(path, path[1:]):
    vx, vy = bx-ax, by-ay
    t = np.clip(((wall_x-ax)*vx+(wall_y-ay)*vy)/(vx*vx+vy*vy), 0, 1)
    ex, ey = wall_x-(ax+t*vx), wall_y-(ay+t*vy)
    distance = ex*ex+ey*ey
    closer = distance < nearest
    dx[closer] = ex[closer]; dy[closer] = ey[closer]
    nearest = np.minimum(nearest, distance)
radial = np.sqrt(nearest) / .097
normal_z = np.sqrt(np.maximum(1-radial*radial, 0))
light = np.clip(normal_z*.28 + dy/.097*.72 - dx/.097*.38, 0, 1)
band = .018 + .45*light**2 + .045*np.exp(-((radial-.975)/.025)**2)
mask = np.clip((1-radial)*180, 0, 1)
shade = shade*(1-mask) + band*mask
wallpaper[:, :, :3] = shade[:, :, None] * np.array((.94, .96, 1.0))
wallpaper_image = bpy.data.images.new('MacBook original graphite ribbon wallpaper', width=wall_w, height=wall_h)
wallpaper_image.colorspace_settings.name = 'sRGB'
wallpaper_image.pixels.foreach_set(wallpaper.ravel())
wallpaper_image.pack()
macbook_screen = material('MacBook emissive graphite display', '090a0d', .30, specular=.26)
screen_nodes = macbook_screen.node_tree.nodes
screen_shader = screen_nodes.get('Principled BSDF')
screen_texture = screen_nodes.new('ShaderNodeTexImage')
screen_texture.image = wallpaper_image
screen_links = macbook_screen.node_tree.links
screen_links.new(screen_texture.outputs['Color'], screen_shader.inputs['Base Color'])
emission_input = screen_shader.inputs.get('Emission Color') or screen_shader.inputs.get('Emission')
if emission_input:
    screen_links.new(screen_texture.outputs['Color'], emission_input)
emission_strength = screen_shader.inputs.get('Emission Strength')
if emission_strength:
    emission_strength.default_value = .85

active = []
models = {}


def register(obj, mat):
    if mat:
        obj.data.materials.append(mat)
    active.append(obj)
    return obj


def box(name, size, pos, mat, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object; obj.name = name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    register(obj, mat)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL'); mod.width = bevel; mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for face in obj.data.polygons: face.use_smooth = False
        normal = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj




def line(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.resolution_u = 1; curve.bevel_depth = radius; curve.bevel_resolution = 2
    spline = curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for point, co in zip(spline.points, points): point.co = (*co, 1)
    obj = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.convert(target='MESH'); obj.select_set(False)
    return register(obj, mat)


def polygon(name, vertices, mat):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], [list(range(len(vertices)))])
    mesh.update(); obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return register(obj, mat)


def cylinder(name, radius, depth, pos, mat, vertices=48, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos, rotation=rotation)
    obj = bpy.context.object; obj.name = name
    for face in obj.data.polygons: face.use_smooth = True
    return register(obj, mat)


def surface_uv(obj, width, height, vertical_axis):
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for loop in obj.data.loops:
        vertex = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (vertex.x / width + .5, vertex[vertical_axis] / height + .5)
    obj['preserve_uv'] = True


def rounded_panel(name, width, height, depth, radius, pos, mat, edge=.004):
    """Independent plan-view corner radius and edge roll; thin cubes clamp bevels."""
    edge = min(edge, depth / 3, radius / 3)
    profiles = [(-depth/2, edge), (-depth/2+edge*.293, edge*.293),
                (-depth/2+edge, 0), (depth/2-edge, 0),
                (depth/2-edge*.293, edge*.293), (depth/2, edge)]
    vertices = []
    for z, inset in profiles:
        r = radius-inset
        for cx, cy, start in [(width/2-radius, height/2-radius, 0),
                              (-width/2+radius, height/2-radius, 90),
                              (-width/2+radius, -height/2+radius, 180),
                              (width/2-radius, -height/2+radius, 270)]:
            for step in range(9):
                angle = math.radians(start+step*90/8)
                vertices.append((cx+r*math.cos(angle), cy+r*math.sin(angle), z))
    count = 36
    faces = [tuple(reversed(range(count)))]
    for ring in range(len(profiles)-1):
        for i in range(count):
            a = ring*count+i
            b = ring*count+(i+1)%count
            faces.append((a, b, b+count, a+count))
    faces.append(tuple(range((len(profiles)-1)*count, len(profiles)*count)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj.location = pos
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices) == 4
    return register(obj, mat)


def cut_panel(target, cutter):
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True); bpy.context.view_layer.objects.active = target
    modifier = target.modifiers.new('Machined recess', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'; modifier.solver = 'EXACT'; modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    active.remove(cutter); bpy.data.objects.remove(cutter, do_unlink=True)


def finish(name):
    # Merge by material to bound draw calls without losing material definition.
    groups = {}
    for obj in active:
        key = obj.data.materials[0].name if obj.data.materials else 'none'
        groups.setdefault(key, []).append(obj)
    merged = []
    for key, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1: bpy.ops.object.join()
        obj = bpy.context.object; obj.name = name + ' / ' + key
        # Explicit UVs also cover generated text and curve geometry.
        if not obj.get('preserve_uv', False):
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(island_margin=.02)
            bpy.ops.object.mode_set(mode='OBJECT')
        merged.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in merged: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', use_selection=True, export_apply=True, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    parent = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(parent)
    for obj in merged: obj.parent = parent
    models[name] = parent
    triangles = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in merged)
    print(f'ASSET {name}: {len(merged)} materials, {triangles} triangles, {(OUT / (name + ".glb")).stat().st_size} bytes')
    active.clear()


# Leather-bound notebook body: back cover, layered signatures, spine, and bookmark.
box('Back cover', (3.72, 4.92, .09), (0, 0, .06), leather, .03)
box('Bound paper block', (3.55, 4.72, .25), (.035, 0, .22), paper, .018)
for i in range(16):
    z = .107 + i * .014
    line('Individual page edge', [(1.813, -2.30, z), (1.813, 2.30, z)], .0018, paper_edge)
    line('Bottom page edge', [(-1.68, -2.365, z), (1.8, -2.365, z)], .0018, paper_edge)
box('Spine', (.18, 4.91, .43), (-1.77, 0, .24), leather, .07)
box('Ribbon bookmark', (.12, .46, .012), (.8, -2.58, .07), foil, .005)
finish('notebook')

# Independently animated front cover, authored in the notebook's original coordinates.
box('Rounded front cover', (3.72, 4.92, .095), (0, 0, .40), leather, .03)
line('Hinge crease', [(-1.55, -2.37, .449), (-1.55, 2.37, .449)], .007, elastic)
box('Elastic closure', (.14, 4.94, .027), (1.37, 0, .464), elastic, .012)
finish('notebook-cover')

# Blank cotton business card, plus a second card underneath.
under = box('Second business card', (4.0, 2.45, .022), (.09, -.06, .013), paper_edge, .004)
under.rotation_euler.z = -.025
box('Cotton business card', (4.0, 2.45, .036), (0, 0, .047), paper, .006)
finish('card')

# A 3.5-inch disk: chamfered injection molding, pressed shutter, and blank paper label.
body = box('Disk casing', (2.65, 2.75, .16), (0, 0, .1), plastic, .065)
box('Shutter recess', (1.95, 1.1, .015), (0, .81, .186), plastic_edge, .025)
shutter = box('Stamped steel shutter', (1.64, 1.02, .026), (-.08, .83, .202), metal, .025)
cutter = box('Shutter opening tool', (.34, .68, .15), (.36, .82, .22), None, .03)
bpy.context.view_layer.objects.active = shutter
mod = shutter.modifiers.new('Read head aperture', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter
bpy.ops.object.modifier_apply(modifier=mod.name)
active.remove(cutter); bpy.data.objects.remove(cutter, do_unlink=True)
for x in [-1.07, 1.07]:
    box('Write protect recess', (.17, .22, .012), (x, -1.13, .186), plastic_edge, .01)
    cylinder('Case fastener', .035, .012, (x, 1.14, .19), plastic_edge, 24)
line('Mold parting line', [(-1.22, -1.2, .186), (-1.22, .3, .186)], .005, plastic_edge)
box('Inset label bed', (2.21, 1.47, .014), (0, -.47, .188), plastic_edge, .025)
box('Aged adhesive label', (2.12, 1.38, .008), (0, -.46, .202), paper, .002)
finish('disk')

# Envelope built from overlapping folds, with a slightly irregular wax seal.
box('Envelope paper body', (3.70, 2.60, .027), (0, 0, .025), kraft, .006)
polygon('Left folded wing', [(-1.85, -1.3, .044), (-.15, .08, .052), (-1.85, 1.3, .044)], kraft_fold)
polygon('Right folded wing', [(1.85, -1.3, .044), (1.85, 1.3, .044), (.15, .08, .052)], kraft_fold)
polygon('Bottom folded pocket', [(-1.85, -1.3, .048), (1.85, -1.3, .048), (.0, .20, .063)], kraft)
polygon('Triangular closure flap', [(-1.85, 1.3, .051), (0, -.20, .094), (1.85, 1.3, .051)], kraft)
line('Flap paper thickness', [(-1.85, 1.3, .054), (0, -.20, .095), (1.85, 1.3, .054)], .008, kraft_fold)
seal = cylinder('Hand pressed wax seal', .235, .046, (0, -.12, .11), wax, 64)
for v in seal.data.vertices:
    angle = math.atan2(v.co.y, v.co.x)
    factor = 1 + .026 * math.sin(angle * 7) + .016 * math.cos(angle * 11)
    v.co.x *= factor; v.co.y *= factor
finish('envelope')

# Open MacBook Pro. The local base is exactly 10.8 x 7.5, with its underside
# at Z=0 and front edge at Y=-3.75. The lid is 105 degrees open from closed.
# Width/depth follows the 14-inch M4's 31.26 x 22.12 cm envelope.
# Rounded outlines are explicit mesh loops, independent of the very thin Z edge.
base = rounded_panel('MacBook aluminum unibody', 10.8, 7.5, .33, .24,
                     (0, 0, .165), macbook_aluminum, .045)
notch = rounded_panel('Front finger recess tool', 1.60, .40, .16, .16,
                      (0, -3.78, .33), None, .035)
cut_panel(base, notch)
trackpad_cut = rounded_panel('Trackpad pocket tool', 5.064, 3.144, .08, .09,
                            (0, -1.80, .34), None)
cut_panel(base, trackpad_cut)
rounded_panel('MacBook trackpad seam', 5.06, 3.14, .008, .09,
              (0, -1.80, .306), macbook_well, .001)
rounded_panel('MacBook flush etched glass trackpad', 5.04, 3.12, .018, .082,
              (0, -1.80, .319), macbook_trackpad, .003)
keyboard_cut = rounded_panel('Keyboard pocket tool', 9.14, 3.38, .12, .12,
                            (0, 1.54, .34), None)
cut_panel(base, keyboard_cut)
rounded_panel('MacBook inset black keyboard bed', 9.13, 3.37, .008, .115,
              (0, 1.54, .284), macbook_well, .001)
for x in (-4.85, 4.85):
    grille = rounded_panel('MacBook micro-perforated speaker grille', .30, 3.12, .004, .045,
                           (x, 1.54, .332), macbook_speaker, .001)
    surface_uv(grille, .30, 3.12, 1)

def add_key_row(labels, widths, y, key_width=.54, gap=.06):
    pitch = key_width + gap
    total = sum(widths) * pitch - gap
    cursor = -total / 2
    for label, units in zip(labels, widths):
        width = units * pitch - gap
        x = cursor + width / 2
        key_mat = macbook_touch_id if label == 'Touch ID' else macbook_key
        keys = [('↑', y+.12, .22), ('↓', y-.12, .22)] if label == '↑↓' else [
            (label, y-.12 if label in ('←', '→') else y, .22 if label in ('←', '→') else .465)
        ]
        for glyph, key_y, key_height in keys:
            rounded_panel('MacBook key ' + (glyph or 'space'), width, key_height, .045, .05,
                          (x, key_y, .313), key_mat, .006)
            if glyph == 'Touch ID':
                sensor = cylinder('MacBook Touch ID sensor ring', .16, .003, (x, key_y, .337), macbook_hinge, 32)
                for face in sensor.data.polygons:
                    face.use_smooth = len(face.vertices) == 4
            elif glyph:
                bpy.ops.object.text_add(location=(x, key_y-.015, .338))
                legend = bpy.context.object
                legend.name = 'MacBook key legend ' + glyph
                legend.data.body = glyph
                legend.data.align_x = 'CENTER'
                legend.data.align_y = 'CENTER'
                legend.data.size = .105 if len(glyph) < 3 else .075
                legend.data.extrude = 0
                legend.data.resolution_u = 3
                bpy.context.view_layer.objects.active = legend
                bpy.ops.object.convert(target='MESH')
                register(legend, macbook_legend)
        cursor += width + gap

add_key_row(['esc'] + ['F' + str(i) for i in range(1, 13)] + ['Touch ID'],
            [1.5] + [1] * 12 + [1.5], 2.89)
add_key_row(['`','1','2','3','4','5','6','7','8','9','0','-','=','delete'],
            [1] * 13 + [2], 2.35)
add_key_row(['tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\'],
            [1.5] + [1] * 12 + [1.5], 1.81)
add_key_row(['caps','A','S','D','F','G','H','J','K','L',';',"'",'return'],
            [1.75] + [1] * 11 + [2.25], 1.27)
add_key_row(['shift','Z','X','C','V','B','N','M',',','.','/','shift'],
            [2.25] + [1] * 10 + [2.75], .73)
add_key_row(['fn','ctrl','opt','cmd','','cmd','opt','←','↑↓','→'],
            [1,1,1,1.25,5.5,1.25,1,1,1,1], .19)

# Hinge axis and display pose conform to the shared camera contract.
hinge = (0, 3.43, .36)
cylinder('MacBook continuous recessed hinge', .10, 9.75, hinge, macbook_hinge, 40, (0, math.pi/2, 0))
lid_angle = math.radians(75)
front = Vector((0, -.965925826, .258819045))
up = Vector((0, .258819045, .965925826))
screen_center = Vector((0, 4.30, 3.62))
lid = rounded_panel('MacBook rounded aluminum display lid', 10.8, 6.85, .12, .23,
                    screen_center-front*.080, macbook_aluminum, .018)
lid.rotation_euler.x = lid_angle
bezel = rounded_panel('MacBook thin continuous display surround', 10.68, 6.73, .024, .18,
                      screen_center-front*.024, macbook_bezel, .004)
bezel.rotation_euler.x = lid_angle
display = rounded_panel('MacBook rounded 3024 by 1964 display', 10.42, 6.62, .012, .13,
                        screen_center-front*.006, macbook_screen, .001)
surface_uv(display, 10.42, 6.62, 1)
display.rotation_euler.x = lid_angle
notch_center = screen_center + up*3.225 + front*.005
camera_notch = rounded_panel('MacBook small rounded camera notch', 1.05, .20, .012, .045,
                            notch_center, macbook_bezel, .001)
camera_notch.rotation_euler.x = lid_angle
camera = cylinder(
    'MacBook camera lens', .034, .012, notch_center + front * .021,
    macbook_camera, 32, (math.radians(75), 0, 0)
)
finish('macbook')

# Separate portrait artwork keeps square measurement cells on the mobile mat.
for name, width, height in [('mat',15,10),('mat-mobile',8,12)]:
    printed_vinyl = mat_rubber.copy()
    printed_vinyl.name = name + ' warm-white measurement screenprint'
    nodes, links = printed_vinyl.node_tree.nodes, printed_vinyl.node_tree.links
    image = bpy.data.images.load(str(SOURCE / 'textures' / (name + '-color.png')))
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    texture.extension = 'EXTEND'
    links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
    mat = rounded_panel('Rounded cutting mat', width, height, .07, .18,
                        (0, 0, -.035), printed_vinyl, .018)
    surface_uv(mat, width, height, 1)
    finish(name)

# Save an editable, arranged desktop scene as well as the individual web exports.
placements = {'notebook':((-3.3,.65,.025),-.13),'notebook-cover':((-3.3,.65,.025),-.13),'card':((2,2.4,.025),.09),'disk':((.7,-1.9,.025),.12),'envelope':((4.7,-1.75,.025),-.16),'mat':((0,0,0),-.015),'macbook':((0,8.65,-.09),0)}
for name, (pos, angle) in placements.items():
    models[name].location = pos; models[name].rotation_euler.z = angle
models['mat-mobile'].hide_render = True; models['mat-mobile'].hide_viewport = True
for obj in models['mat-mobile'].children:
    obj.hide_render = True
    obj.hide_set(True)
table_material = material('Satin natural butcher-block tabletop', 'ffffff', .68, specular=.34)
nodes, links = table_material.node_tree.nodes, table_material.node_tree.links
mapping = nodes.new('ShaderNodeMapping'); mapping.inputs['Scale'].default_value = (42/24, 24.75/15, 1)
mapping.inputs['Location'].default_value = (-21/24, -10/15, 0)
uv = nodes.new('ShaderNodeTexCoord'); links.new(uv.outputs['UV'], mapping.inputs[0])
for filename, socket in [
    ('wood.jpg', 'Base Color'),
    ('wood-normal.jpg', 'Normal'),
    ('wood-roughness.jpg', 'Roughness'),
]:
    image = bpy.data.images.load(str(ROOT / 'public/textures' / filename))
    image.colorspace_settings.name = 'sRGB' if socket == 'Base Color' else 'Non-Color'
    image.pack()
    tex = nodes.new('ShaderNodeTexImage'); tex.image = image
    links.new(mapping.outputs[0], tex.inputs[0])
    if socket == 'Normal':
        normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .075
        links.new(tex.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs[0], nodes.get('Principled BSDF').inputs[socket])
    else:
        links.new(tex.outputs['Color'], nodes.get('Principled BSDF').inputs[socket])
bpy.ops.mesh.primitive_plane_add(size=2, location=(0,2.375,-.088))
table = bpy.context.object; table.name = 'Natural butcher-block tabletop'; table.scale = (21,12.375,1)
table.data.materials.append(table_material)
room_wall = material('Matte warm-white plaster wall', 'eee7dc', .95, specular=.25)
room_floor = material('Warm neutral room floor', '857e73', 1, specular=.2)
table_edge = material('Butcher-block slab edge', '4b2d1c', .82, specular=.3)
box('Finite tabletop slab', (42,24.69,.9), (0,2.345,-.54), table_edge, .035)
box('Room wall behind laptop', (50,.2,40), (0,14.85,-4.09), room_wall, .01)
box('Room floor', (50,35,.15), (0,-2.75,-24.165), room_floor, .01)
bpy.ops.object.camera_add(location=(0,0,18))
camera = bpy.context.object; camera.name='Top-down orthographic'; camera.data.type='ORTHO'; camera.data.ortho_scale=16.5
camera.rotation_euler=(0,0,0); bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA', location=(-3,5,9))
light=bpy.context.object; light.name='Large soft window'; light.data.energy=1600; light.data.shape='DISK'; light.data.size=7
light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.world.color=(.3,.3,.3)
bpy.context.scene.render.resolution_x=1600; bpy.context.scene.render.resolution_y=1100
bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.filepath = str(ROOT / '.impeccable/review/blender-desk.png')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'desk.blend'))
print('Saved editable Blender source:', SOURCE / 'desk.blend')
