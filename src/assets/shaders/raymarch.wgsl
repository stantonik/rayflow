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
    rotation: vec3<f32>,
    scale: vec3<f32>,
    color: vec3<f32>,
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

@vertex
fn vs_main(@location(0) position: vec2<f32>) -> VertexOut {
    var out: VertexOut;
    out.position = vec4f(position, 0.0, 1.0);
    return out;
}

// Basic Ray Marching with Simple Primitives
@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = (fragCoord.xy) * 2.0 / uniforms.resolution.xy - 1.0;
    let mouse = vec3<f32>((uniforms.mouse.xy) * 2.0 / uniforms.resolution.xy - 1.0, uniforms.mouse.z);

    if uniforms.mouse.z == 1.0 {
    // NDC coordinates
        let ndc = vec4<f32>(mouse.x, -mouse.y, 1.0, 1.0);
        let world_pos = camera.invViewProj * ndc;
        let world_pos3 = world_pos.xyz / world_pos.w;

        let ro = camera.position;
        let rd = normalize(world_pos3 - ro);

        let id = pick_object(ro, rd);
        objectHitBuffer[0] = f32(id);
    }

    let cam_pos = camera.position;

    let ndc = vec4<f32>(uv.x, -uv.y, 1.0, 1.0);
    let world_pos = camera.invViewProj * ndc;
    let world_pos3 = world_pos.xyz / world_pos.w;
    let rd = normalize(world_pos3 - camera.position);

  // Ray march
    let result = ray_march(cam_pos, rd);
    let dist = result.x;
    let mat_id = result.y;

    if dist < MAX_DIST {
    // Hit something - calculate lighting
        let hit_pos = cam_pos + rd * dist;
        let normal = get_normal(hit_pos);

    // Diffuse Lighting
        let light_pos = vec3<f32>(2.0, 5.0, -1.0);
        let light_dir = normalize(light_pos - hit_pos);
        let diffuse = max(dot(normal, light_dir), 0.0);

    // Shadow Casting
        let shadow_origin = hit_pos + normal * 0.01;
        let shadow_result = ray_march(shadow_origin, light_dir);
        let shadow = select(0.3, 1.0, shadow_result.x > length(light_pos - shadow_origin));

    // Phong Shading
        let ambient = 0.2;
        var albedo = get_material_color(mat_id, hit_pos);
        let phong = albedo * (ambient + diffuse * shadow * 0.8);

    // Exponential Fog
        let fog = exp(-dist * 0.02);
        let color = mix(MAT_SKY_COLOR, phong, fog);

        return vec4<f32>(gamma_correct(color), 1.0);
    }

  // Sky gradient
    let sky = mix(MAT_SKY_COLOR, MAT_SKY_COLOR * 0.9, uv.y * 0.5 + 0.5);
    return vec4<f32>(gamma_correct(sky), 1.0);
}

// Gamma Correction
fn gamma_correct(color: vec3<f32>) -> vec3<f32> {
    return pow(color, vec3<f32>(1.0 / 2.2));
}

// Constants
const MAX_DIST: f32 = 100.0;
const SURF_DIST: f32 = 0.001;
const MAX_STEPS: i32 = 256;

// Material Types
const MAT_PLANE: f32 = 0.0;
const MAT_SPHERE: f32 = 1.0;
const MAT_GRID: f32 = 2.0;

// Material Colors
const MAT_SKY_COLOR: vec3<f32> = vec3<f32>(0.25, 0.25, 0.25);

fn get_material_color(mat_id: f32, p: vec3<f32>) -> vec3<f32> {
    if mat_id == MAT_PLANE {
        let checker = floor(p.x) + floor(p.z);
        let col1 = vec3<f32>(0.9, 0.9, 0.9);
        let col2 = vec3<f32>(0.2, 0.2, 0.2);
        return select(col2, col1, i32(checker) % 2 == 0);
    } else if mat_id == MAT_SPHERE {
        return vec3<f32>(1.0, 0.3, 0.3);
    } else if mat_id == MAT_GRID {
        var color = vec3<f32>(0.31, 0.31, 0.31);
        let modx = abs(p.x - 10.0 * floor(p.x / 10.0 + 0.5));
        let modz = abs(p.z - 10.0 * floor(p.z / 10.0 + 0.5));
        if abs(p.z) < 0.025 {
            return vec3<f32>(1.0, 0.0, 0.0);
        } else if abs(p.x) < 0.025 {
            return vec3<f32>(0.0, 1.0, 0.0);
        } else if (modx < 0.025) || (modz < 0.025) {
            return color * 0.4;
        }

        return color;
    }

    return vec3<f32>(0.5, 0.5, 0.5);
}

// SDF Primitives
fn sd_sphere(p: vec3<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn sd_box(p: vec3<f32>, b: vec3<f32>) -> f32 {
    let q = abs(p) - b;
    return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sd_torus(p: vec3<f32>, t: vec2<f32>) -> f32 {
    let q = vec2<f32>(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

fn sd_plane(p: vec3<f32>, n: vec3<f32>, h: f32) -> f32 {
    return dot(p, n) + h;
}

fn sd_grid_2D(p: vec3<f32>, thickness: f32, tile_size: f32) -> f32 {
    var q = p;

    // repeat in X and Z using modular distance
    q.x = q.x - tile_size * floor(q.x / tile_size + 0.5);
    q.z = q.z - tile_size * floor(q.z / tile_size + 0.5);

    // distance from line in X and Z
    let dx = abs(q.x) - thickness;
    let dz = abs(q.z) - thickness;

    // clamp to zero inside the thickness
    let dX = max(dx, 0.0);
    let dZ = max(dz, 0.0);

    // Y distance for flat grid
    return max(min(dX, dZ), abs(q.y));
}

// SDF Operations
fn op_union(d1: f32, d2: f32) -> f32 {
    return min(d1, d2);
}

fn op_subtract(d1: f32, d2: f32) -> f32 {
    return max(-d1, d2);
}

fn op_intersect(d1: f32, d2: f32) -> f32 {
    return max(d1, d2);
}

fn op_smooth_union(d1: f32, d2: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

fn get_dist_obj(p: vec3<f32>) -> vec3<f32> {
    var res = vec3<f32>(MAX_DIST, -1.0, -1.0);

    for (var i: u32 = 0u; i < objectCount; i = i + 1u) {
        let obj = objects[i];
        let obj_dist = sd_sphere(p - obj.position, obj.scale[0]);
        if obj_dist < res.x {
            res = vec3<f32>(obj_dist, MAT_SPHERE, f32(i));
        }
    }

    return res;
}

// Scene description - returns (distance, material_id)
fn get_dist(p: vec3<f32>) -> vec2<f32> {
    var res = vec2<f32>(MAX_DIST, -1.0);

    let grid_dist = sd_grid_2D(p, 0.025, 1.0);
    if grid_dist < res.x {
        res = vec2<f32>(grid_dist, MAT_GRID);
    }

    let obj_dist = get_dist_obj(p);
    if obj_dist.x < res.x {
        res = obj_dist.xy;
    }

    return res;
}

// Ray marching function - returns (distance, material_id)
fn ray_march(ro: vec3<f32>, rd: vec3<f32>) -> vec2<f32> {
    var d = 0.0;
    var mat_id = -1.0;

    for (var i = 0; i < MAX_STEPS; i++) {
        let p = ro + rd * d;
        let dist_mat = get_dist(p);
        d += dist_mat.x;
        mat_id = dist_mat.y;

        if dist_mat.x < SURF_DIST || d > MAX_DIST {
      break;
        }
    }

    return vec2<f32>(d, mat_id);
}

// Calculate normal using gradient
fn get_normal(p: vec3<f32>) -> vec3<f32> {
    let e = vec2<f32>(0.001, 0.0);
    let n = vec3<f32>(
        get_dist(p + e.xyy).x - get_dist(p - e.xyy).x,
        get_dist(p + e.yxy).x - get_dist(p - e.yxy).x,
        get_dist(p + e.yyx).x - get_dist(p - e.yyx).x
    );
    return normalize(n);
}

// Mouse Raycaster
fn pick_object(ro: vec3<f32>, rd: vec3<f32>) -> i32 {
    var d = 0.0;
    var id = -1.0;

    for (var i = 0; i < MAX_STEPS; i = i + 1) {
        let p = ro + rd * d;
        let dist_mat = get_dist_obj(p); // vec3<f32>
        d += dist_mat.x;

        if (dist_mat.x < SURF_DIST) {
            id = dist_mat.z; // only update if actually hit
            break;           // stop marching
        }

        if d > MAX_DIST {
            break; // stop marching if too far
        }
    }

    return i32(id);
}

