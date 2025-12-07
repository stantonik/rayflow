
struct Uniforms {
    resolution: vec2<f32>,
    mouse: vec4<f32>,
    time: f32,
    deltaTime: f32,
    picking: f32,
    activeObjIdx: f32,
};

struct Camera {
    position: vec3<f32>,
    invViewProj: mat4x4<f32>,
};

struct Object {
    position: vec3<f32>,
    _pad0: f32,
    rotation: vec3<f32>,
    _pad1: f32,
    scale: vec3<f32>,
    _pad2: f32,
    color: vec3<f32>,
    _pad3: f32,
    primitive: f32,
    id: f32,
};

@group(0) @binding(0)
var<uniform> uniforms : Uniforms;

@group(0) @binding(1)
var<storage, read> objects: array<Object>;

@group(0) @binding(2)
var<uniform> objectCount: u32;

@group(0) @binding(3)
var<storage, read_write> objectHitBuffer: array<vec2<f32>>;

@group(0) @binding(4)
var<uniform> camera: Camera;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
}

// -------------------------------------------------------------

@vertex
fn vs_main(@location(0) position: vec2<f32>) -> VertexOut {
    var out: VertexOut;
    out.position = vec4(position, 0.0, 1.0);
    return out;
}

// -------------------------------------------------------------
// SDFResult: unified return for distance + material + index + color
// -------------------------------------------------------------
struct SDFResult {
    dist: f32,
    mat: f32,
    idx: f32,
};

// -------------------------------------------------------------
const MAX_DIST: f32 = 100.0;
const SURF_DIST: f32 = 0.001;
const MAX_STEPS: i32 = 256;

const MAX_DIST_PICK: f32 = 40.0;
const SURF_DIST_PICK: f32 = 0.1;
const MAX_STEPS_PICK: i32 = 64;

const PI: f32 = 3.14159265359;

const MAT_OBJ = 0.0;
const MAT_GIZMO_ARROW = 1.0;
const MAT_GIZMO = 2.0;
const MAT_GRID = 3.0;

const MAT_SKY_COLOR: vec3<f32> = vec3(0.15, 0.15, 0.20);

const GRID_LINE_WIDTH = 0.018;

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
fn atan2(y: f32, x: f32) -> f32 {
    return select(0.5 * 3.14159265, atan(y / x), x != 0.0);
}

// -------------------------------------------------------------
// Primitives
// -------------------------------------------------------------
fn sd_sphere(p: vec3<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn sd_ellipsoid(p: vec3<f32>, radii: vec3<f32>) -> f32 {
    let k0 = length(p / radii);
    let k1 = length(p / (radii * radii));
    return k0 * (k0 - 1.0) / k1;
}

fn sd_box(p: vec3<f32>, b: vec3<f32>) -> f32 {
    let q = abs(p) - b;
    return length(max(q, vec3(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sd_torus(p: vec3<f32>, t: vec2<f32>) -> f32 {
    let q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

fn sd_cylinder(p: vec3<f32>, r: f32, h: f32) -> f32 {
    let d = abs(vec2<f32>(length(p.xz), p.y)) - vec2<f32>(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0, 0.0)));
}

fn sd_cone(p: vec3<f32>, r: f32, h: f32) -> f32 {
    // c = normalize( vec2(h, r) )
    let hh = h * 2.0;
    let invLen = inverseSqrt(hh * hh + r * r);
    let c = vec2<f32>(hh * invLen, r * invLen);

    let q = length(vec2<f32>(p.x, p.z));

    // max( distance-to-side, distance-to-base-plane )
    return max(dot(c, vec2<f32>(q, p.y - h)), -hh - p.y + h);
}

fn sd_capsule(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

// -------------------------------------------------------------
// Rotation helper
// -------------------------------------------------------------
fn rotate_x(p: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(
        p.x,
        c * p.y - s * p.z,
        s * p.y + c * p.z
    );
}

fn rotate_y(p: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3(
        c * p.x + s * p.z,
        p.y,
        -s * p.x + c * p.z
    );
}

fn rotate_z(p: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3<f32>(
        c * p.x - s * p.y,
        s * p.x + c * p.y,
        p.z
    );
}

// -------------------------------------------------------------
// Primitive dispatcher
// -------------------------------------------------------------
fn sdf_primitive(p: vec3<f32>, primitiveType: u32, scale: vec3<f32>, rotation: vec3<f32>) -> f32 {
    var q = p;

    // Apply rotation (simple Y rotation for demonstration; can extend to XYZ)
    if rotation.x != 0.0 {
        q = rotate_x(q, rotation.x / 180.0 * PI);
    }
    if rotation.y != 0.0 {
        q = rotate_y(q, rotation.y / 180.0 * PI);
    }
    if rotation.z != 0.0 {
        q = rotate_z(q, rotation.z / 180.0 * PI);
    }

    switch (primitiveType) {
        case 0u: { // SPHERE / ELLIPSOID
            if all(scale == vec3<f32>(scale.x)) {
                return sd_sphere(q, scale.x);
            } else {
                return sd_ellipsoid(q, scale);
            }
        }
        case 1u: { // BOX / CUBOID
            return sd_box(q, scale);
        }
        case 2u: { // TORUS
            return sd_torus(q, vec2<f32>(scale.x, scale.y));
        }
        case 3u: { // CYLINDER
            return sd_cylinder(q, scale.x, scale.y);
        }
        case 4u: { // CONE
            return sd_cone(q, scale.x, scale.y);
        }
        case 5u: { // CAPSULE
            let a = vec3<f32>(0.0, -scale.y * 0.5, 0.0);
            let b = vec3<f32>(0.0, scale.y * 0.5, 0.0);
            return sd_capsule(q, a, b, scale.x);
        }
        default: {
            return MAX_DIST;
        }
    }
}


fn sd_grid_2D(p: vec3<f32>, thickness: f32, tile_size: f32, width: f32, height: f32) -> f32 {
    var q = p;
    q.x = q.x - tile_size * floor(q.x / tile_size + 0.5);
    q.z = q.z - tile_size * floor(q.z / tile_size + 0.5);

    let dx = abs(q.x) - thickness;
    let dz = abs(q.z) - thickness;

    let dX = max(dx, 0.0);
    let dZ = max(dz, 0.0);

    return max(min(dX, dZ), abs(q.y));
}

fn get_material_color(p: vec3<f32>, res: SDFResult) -> vec3<f32> {
    var color: vec3<f32>;

    if res.mat == MAT_OBJ {
        let idx = i32(res.idx);
        let obj = objects[idx];
        color = obj.color;
        // Highlight selected obj
        if (idx == i32(uniforms.activeObjIdx)) {
            color = mix(color, vec3<f32>(1.0, 0.0, 0.0), 0.4);
        }
    } else if res.mat == MAT_GRID {
        let modx = abs(p.x - 10.0 * floor(p.x / 10.0 + 0.5));
        let modz = abs(p.z - 10.0 * floor(p.z / 10.0 + 0.5));

        if abs(p.z) < GRID_LINE_WIDTH {
            color = vec3(1.0, 0.0, 0.0);
        } else if abs(p.x) < GRID_LINE_WIDTH {
            color = vec3(0.0, 0.0, 1.0);
        } else if modx < GRID_LINE_WIDTH || modz < GRID_LINE_WIDTH {
            color = vec3(0.31) * 0.3;
        } else {
            color = vec3(0.2);
        }
    } else if res.mat == MAT_GIZMO || res.mat == MAT_GIZMO_ARROW {
        let axe = u32(res.idx);
        if axe == 0u {
            color = vec3<f32>(1.0, 0.0, 0.0);
        } else if axe == 1u {
            color = vec3<f32>(0.0, 1.0, 0.0);
        } else if axe == 2u {
            color = vec3<f32>(0.0, 0.0, 1.0);
        }
        // Highlight hovered arrow
        if res.mat == MAT_GIZMO_ARROW && objectHitBuffer[0].x == 1.0 && axe == u32(objectHitBuffer[1].y) {
            color = mix(color, vec3<f32>(0.0), 0.5);
        }
    }

    return color;
}

// -------------------------------------------------------------
// OBJECT DISTANCE (with object color)
// -------------------------------------------------------------
fn get_dist_obj(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = -1.0;
    res.idx = -1.0;

    for (var i: u32 = 0u; i < objectCount; i++) {
        let obj = objects[i];
        let primitive = u32(obj.primitive);

        let local_p = p - obj.position;
        let d = sdf_primitive(local_p, u32(obj.primitive), obj.scale, obj.rotation);

        if d < res.dist {
            res.dist = d;
            res.idx = f32(i);
            res.mat = MAT_OBJ;
        }
    }

    return res;
}

fn get_dist_gizmo_arrow(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = MAT_GIZMO_ARROW;

    if uniforms.activeObjIdx < 0.0 {
        return res;
    }
    let trackedObj = objects[u32(uniforms.activeObjIdx)];

    let q = p - trackedObj.position;
    let s = trackedObj.scale * 1.2;

    //let sx = trackedObj.

    let cone_dia = 0.1;
    let cone_h = 0.1;

    // --- X axis ---
    let x_cone_pos = vec3<f32>(s.x + cone_h, 0.0, 0.0);
    var d = sd_cone(rotate_z(q - x_cone_pos, PI / 2.0), cone_dia, cone_h);
    if d < res.dist {
        res.dist = d;
        res.idx = 0.0;
    }

    // --- Y axis ---
    let y_cone_pos = vec3<f32>(0.0, s.y + cone_h, 0.0);
    d = sd_cone(q - y_cone_pos, cone_dia, cone_h);
    if d < res.dist {
        res.dist = d;
        res.idx = 1.0;
    }

    // --- Z axis ---
    let z_cone_pos = vec3<f32>(0.0, 0.0, s.z + cone_h);
    d = sd_cone(rotate_x(q - z_cone_pos, -PI / 2.0), cone_dia, cone_h);
    if d < res.dist {
        res.dist = d;
        res.idx = 2.0;
    }

    return res;
}

fn get_dist_gizmo(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = MAT_GIZMO;

    if uniforms.activeObjIdx < 0.0 {
        return res;
    }
    let trackedObj = objects[u32(uniforms.activeObjIdx)];

    let q = p - trackedObj.position;
    let s = trackedObj.scale * 1.2;

    let line_r = 0.02; // radius of connecting line

    // X line
    let x_end_pos = vec3<f32>(s.x, 0.0, 0.0);
    var d = sd_capsule(q, vec3<f32>(0.0, 0.0, 0.0), x_end_pos, line_r);
    if d < res.dist {
        res.dist = d;
        res.idx = 0.0;
    }

    // Y line
    let y_end_pos = vec3<f32>(0.0, s.y, 0.0);
    d = sd_capsule(q, vec3<f32>(0.0, 0.0, 0.0), y_end_pos, line_r);
    if d < res.dist {
        res.dist = d;
        res.idx = 1.0;
    }

    // Z line
    let z_end_pos = vec3<f32>(0.0, 0.0, s.z);
    d = sd_capsule(q, vec3<f32>(0.0, 0.0, 0.0), z_end_pos, line_r);
    if d < res.dist {
        res.dist = d;
        res.idx = 2.0;
    }

    let c = get_dist_gizmo_arrow(p);
    if c.dist < res.dist {
        res = c;
    }

    return res;
}

fn get_dist_grid(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = -1.0;
    res.idx = -1.0;

    // ----- GRID -----
    let gd = sd_grid_2D(p, GRID_LINE_WIDTH, 1.0, 20.0, 20.0);
    if gd < res.dist {
        res.dist = gd;
        res.idx = -1.0;
        res.mat = MAT_GRID;
    }

    return res;
}


// -------------------------------------------------------------
// SCENE SDF (distance + material + color integrated here)
// -------------------------------------------------------------
fn get_dist(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = -1.0;
    res.idx = -1.0;

    // ----- GRID -----
    let g = get_dist_grid(p);
    if g.dist < res.dist {
        res = g;
    }

    // ----- OBJECTS -----
    let o = get_dist_obj(p);
    if o.dist < res.dist {
        res = o;
    }

    return res;
}

// -------------------------------------------------------------
// RAY MARCH (returns SDFResult including color)
// -------------------------------------------------------------
fn ray_march(ro: vec3<f32>, rd: vec3<f32>, mode: u32) -> SDFResult {
    var total = 0.0;
    var res: SDFResult;

    res.dist = MAX_DIST;
    res.idx = -1.0;
    res.mat = -1.0;

    for (var i = 0; i < MAX_STEPS; i++) {
        let p = ro + rd * total;
        var s: SDFResult;

        if mode == 0u {
            s = get_dist(p);
        } else if mode == 1u {
            s = get_dist_gizmo(p);
        } else if mode == 2u {
            s = get_dist_obj(p);
        }

        total += s.dist;
        res = s;

        if s.dist < SURF_DIST || total > MAX_DIST {
            res.dist = total;
            return res;
        }
    }

    res.dist = total;
    return res;
}

// -------------------------------------------------------------
fn get_normal(p: vec3<f32>) -> vec3<f32> {
    let e = vec2(0.001, 0.0);
    return normalize(vec3(
        get_dist(p + e.xyy).dist - get_dist(p - e.xyy).dist,
        get_dist(p + e.yxy).dist - get_dist(p - e.yxy).dist,
        get_dist(p + e.yyx).dist - get_dist(p - e.yyx).dist
    ));
}

// -------------------------------------------------------------
// return vec2(type, index)
fn pick(ro: vec3<f32>, rd: vec3<f32>) -> vec2<f32> {
    var t = 0.0;

    for (var i = 0; i < MAX_STEPS_PICK; i++) {
        let p = ro + rd * t;
        var s = get_dist_obj(p);

        if uniforms.activeObjIdx >= 0.0 {
            let q = get_dist_gizmo_arrow(p);
            if q.dist < MAX_DIST {
                s = q;
            } 
        }

        t += s.dist;
        if s.dist < SURF_DIST_PICK {
            return vec2<f32>(s.mat, s.idx);
        }
        if t > MAX_DIST_PICK {
            break;
        }
    }
    return vec2<f32>(-1.0, -1.0);
}

// -------------------------------------------------------------
// Gamma
fn gamma_correct(c: vec3<f32>) -> vec3<f32> {
    return pow(c, vec3(1.0 / 2.2));
}
// -------------------------------------------------------------

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy * 2.0 / uniforms.resolution.xy - 1.0;

    // Mouse picking ray
    if i32(fragCoord.x) < i32(uniforms.mouse.x) && i32(fragCoord.y) == i32(uniforms.mouse.y) && u32(uniforms.picking) == 1u {
        let ndc = vec4(
            (uniforms.mouse.x * 2.0 / uniforms.resolution.x - 1.0),
            -(uniforms.mouse.y * 2.0 / uniforms.resolution.y - 1.0),
            1.0,
            1.0
        );

        let wp = camera.invViewProj * ndc;
        let pos3 = wp.xyz / wp.w;

        let ro = camera.position;
        let rd = normalize(pos3 - ro);

        let pick_res = pick(ro, rd);
        objectHitBuffer[0] = pick_res;
    }

    // Main view ray
    let ndc = vec4(uv.x, -uv.y, 1.0, 1.0);
    let wp = camera.invViewProj * ndc;
    let pos3 = wp.xyz / wp.w;
    let ro = camera.position;
    let rd = normalize(pos3 - ro);

    var hit = ray_march(ro, rd, 0u);

    if uniforms.activeObjIdx >= 0.0 {
        let gizmo_hit = ray_march(ro, rd, 1u);

        if gizmo_hit.dist < MAX_DIST {
            hit = gizmo_hit;
        }
    }
    let dist = hit.dist;

    if dist < MAX_DIST {
        let hit_pos = ro + rd * dist;
        let normal = get_normal(hit_pos);

        var color = get_material_color(hit_pos, hit);

        if hit.mat != MAT_GRID {
            // Lighting
            let light_pos = vec3(100.0, 100.0, -100.0);
            let light_dir = normalize(light_pos - hit_pos);
            let diffuse = max(dot(normal, light_dir), 0.0);

            let ambient = 0.5;
            let albedo = color;

            // Shadow
            let shadow_pos = hit_pos + normal * 0.01;
            // let shadow = select(0.3, 1.0, ray_march(shadow_pos, light_dir, 0u).dist > length(light_pos - shadow_pos));
            let shadow = select(1.0, ambient, ray_march(shadow_pos, light_dir, 2u).dist < MAX_DIST);


            let shaded = albedo * (ambient + diffuse * shadow * 0.8);

            // Fog
            let fog = exp(-dist * 0.005);
            color = mix(MAT_SKY_COLOR, shaded, fog);
        }

        return vec4(gamma_correct(color), 1.0);
    }

    // Sky
    let sky = mix(MAT_SKY_COLOR, MAT_SKY_COLOR * 0.9, uv.y * 0.5 + 0.5);
    return vec4(gamma_correct(sky), 1.0);
}

