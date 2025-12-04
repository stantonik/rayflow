
struct Uniforms {
    resolution: vec2<f32>,
    mouse: vec4<f32>,
    time: f32,
    deltaTime: f32,
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
var<storage, read_write> objectHitBuffer: array<f32>;

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
    color: vec3<f32>,
};

// -------------------------------------------------------------
const MAX_DIST: f32 = 100.0;
const SURF_DIST: f32 = 0.001;
const MAX_STEPS: i32 = 256;

const MAT_GRID = 0.0;

const MAT_SKY_COLOR: vec3<f32> = vec3(0.25, 0.25, 0.25);

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

fn sd_cylinder(p: vec3<f32>, radius: f32) -> f32 {
    return length(p.xz) - radius;
}

fn sd_cone_simple(p: vec3<f32>, angle: f32) -> f32 {
    let q = vec2(length(p.xz), p.y);
    let s = atan2(q.x, q.y);
    return length(q) * cos(angle) - q.y;
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
fn rotate_y(p: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec3(
        c * p.x + s * p.z,
        p.y,
        -s * p.x + c * p.z
    );
}

// -------------------------------------------------------------
// Primitive dispatcher
// -------------------------------------------------------------
fn sdf_primitive(p: vec3<f32>, primitiveType: u32, scale: vec3<f32>, rotation: vec3<f32>) -> f32 {
    var q = p;

    // Apply rotation (simple Y rotation for demonstration; can extend to XYZ)
    q = rotate_y(q, rotation.y);

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
            return sd_cylinder(q, scale.x);
        }
        case 4u: { // CONE
            return sd_cone_simple(q, scale.x);
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


fn sd_grid_2D(p: vec3<f32>, thickness: f32, tile_size: f32) -> f32 {
    var q = p;
    q.x = q.x - tile_size * floor(q.x / tile_size + 0.5);
    q.z = q.z - tile_size * floor(q.z / tile_size + 0.5);

    let dx = abs(q.x) - thickness;
    let dz = abs(q.z) - thickness;

    let dX = max(dx, 0.0);
    let dZ = max(dz, 0.0);

    return max(min(dX, dZ), abs(q.y));
}

// -------------------------------------------------------------
// OBJECT DISTANCE (with object color)
// -------------------------------------------------------------
fn get_dist_obj(p: vec3<f32>) -> SDFResult {
    var res: SDFResult;
    res.dist = MAX_DIST;
    res.mat = -1.0;
    res.idx = -1.0;
    res.color = vec3(0.0);

    for (var i: u32 = 0u; i < objectCount; i++) {
        let obj = objects[i];
        let primitive = u32(obj.primitive);

        let local_p = p - obj.position;
        let d = sdf_primitive(local_p, u32(obj.primitive), obj.scale, obj.rotation);

        if d < res.dist {
            res.dist = d;
            res.idx = obj.id;
            res.color = obj.color;
            if (obj.id == objectHitBuffer[0]) {
                res.color = mix(res.color, vec3<f32>(1.0, 0.0, 0.0), 0.4);
            }
        }
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
    res.color = vec3(0.0);

    // ----- GRID -----
    let gd = sd_grid_2D(p, 0.025, 1.0);
    if gd < res.dist {
        res.dist = gd;
        res.idx = -1.0;
        res.mat = MAT_GRID;

        // Reproduce your grid color logic:
        let modx = abs(p.x - 10.0 * floor(p.x / 10.0 + 0.5));
        let modz = abs(p.z - 10.0 * floor(p.z / 10.0 + 0.5));

        if abs(p.z) < 0.025 {
            res.color = vec3(1.0, 0.0, 0.0);
        } else if abs(p.x) < 0.025 {
            res.color = vec3(0.0, 1.0, 0.0);
        } else if modx < 0.025 || modz < 0.025 {
            res.color = vec3(0.31) * 0.4;
        } else {
            res.color = vec3(0.31);
        }
    }

    // ----- OBJECTS -----
    let o = get_dist_obj(p);
    if o.dist < res.dist {
        res = o; // includes color + idx
    }

    return res;
}

// -------------------------------------------------------------
// RAY MARCH (returns SDFResult including color)
// -------------------------------------------------------------
fn ray_march(ro: vec3<f32>, rd: vec3<f32>) -> SDFResult {
    var total = 0.0;
    var res: SDFResult;

    res.dist = MAX_DIST;
    res.idx = -1.0;
    res.mat = -1.0;
    res.color = vec3(0.0);

    for (var i = 0; i < MAX_STEPS; i++) {
        let p = ro + rd * total;
        let s = get_dist(p);

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
fn pick_object(ro: vec3<f32>, rd: vec3<f32>) -> i32 {
    var t = 0.0;
    for (var i = 0; i < MAX_STEPS; i++) {
        let p = ro + rd * t;
        let s = get_dist_obj(p);

        t += s.dist;
        if s.dist < SURF_DIST {
            return i32(s.idx);
        }
        if t > MAX_DIST {
            break;
        }
    }
    return -1;
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
    if uniforms.mouse.z == 1.0 {
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

        objectHitBuffer[0] = f32(pick_object(ro, rd));
    }

    // Main view ray
    let ndc = vec4(uv.x, -uv.y, 1.0, 1.0);
    let wp = camera.invViewProj * ndc;
    let pos3 = wp.xyz / wp.w;
    let ro = camera.position;
    let rd = normalize(pos3 - ro);

    let rm = ray_march(ro, rd);
    let dist = rm.dist;

    if dist < MAX_DIST {
        let hit_pos = ro + rd * dist;
        let normal = get_normal(hit_pos);

        var color = rm.color;

        if rm.mat != MAT_GRID {
        // Lighting
            let light_pos = vec3(2.0, 5.0, -1.0);
            let light_dir = normalize(light_pos - hit_pos);
            let diffuse = max(dot(normal, light_dir), 0.0);

        // Shadow
            let shadow_pos = hit_pos + normal * 0.01;
            let shadow = select(0.3, 1.0, ray_march(shadow_pos, light_dir).dist > length(light_pos - shadow_pos));

            let ambient = 0.2;
            let albedo = rm.color;

            let shaded = albedo * (ambient + diffuse * shadow * 0.8);

        // Fog
            let fog = exp(-dist * 0.02);
            color = mix(MAT_SKY_COLOR, shaded, fog);
        }

        return vec4(gamma_correct(color), 1.0);
    }

    // Sky
    let sky = mix(MAT_SKY_COLOR, MAT_SKY_COLOR * 0.9, uv.y * 0.5 + 0.5);
    return vec4(gamma_correct(sky), 1.0);
}

