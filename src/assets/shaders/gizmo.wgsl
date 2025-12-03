@group(0) @binding(0) var<uniform> uViewProj : mat4x4<f32>;

struct VSOut {
    @builtin(position) Position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) color: vec3<f32>
) -> VSOut {
    var out: VSOut;
    out.Position = uViewProj * vec4<f32>(pos, 1.0);
    out.color = color;
    return out;
}

@fragment
fn fs_main(
    @builtin(position) fragCoord: vec4<f32>,
    @location(0) color: vec3<f32>
) -> @location(0) vec4<f32> {
    return vec4<f32>(color, 1.0);
}

