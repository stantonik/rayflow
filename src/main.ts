/*
 * main.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import "./styles/style.css"
import { vec3 } from "gl-matrix";
import { RayMarcher } from "./raymarching";
import { Camera } from "./camera";
import { Object } from "./object";
import { GizmoRenderer } from "./gizmos";

let device: GPUDevice;
let raymarcher: RayMarcher;
let gizmoRenderer: GizmoRenderer;
let camera: Camera;

const app = document.querySelector("#app")! as HTMLElement;

const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
app.appendChild(canvas);

async function start(canvas: HTMLCanvasElement) {
    // --- Init WebGPU ---
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter!.requestDevice();
    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format,
        alphaMode: "opaque",
    });

    camera = new Camera();
    raymarcher = new RayMarcher(device, format, camera);
    gizmoRenderer = new GizmoRenderer(device, format, camera);

    // const testMesh = OBJLoader.parseToMesh((await import("./assets/gizmos/cone.obj?raw")).default, device);
    // testMesh.setModelMatrix(model);

    const sphere1 = new Object({name: "Sphere1"});
    raymarcher.addObject(sphere1);
    const sphere2 = new Object({name: "Sphere2", scale: [0.1, 0, 0], position: [2, 0, 0]});
    raymarcher.addObject(sphere2);

    // --- FRAME LOOP ---
    function frame(t: number) {
        const encoder = device.createCommandEncoder();
        const view = context.getCurrentTexture().createView();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view,
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        raymarcher.updateUniforms({
            resolution: [canvas.width, canvas.height],
            time: t / 1000
        });

        raymarcher.render(pass);

        gizmoRenderer.render(pass);

        pass.end();

        device.queue.submit([encoder.finish()]);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

await start(canvas);

const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resize();

// --- EVENT LISTENERS ---
window.addEventListener("resize", resize);

// Assume `camera` is an instance of Camera
let isLeftDown = false;
let isRightDown = false;
let lastMouse: [number, number] = [0, 0];

// --- Mouse down ---
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) isLeftDown = true;
    if (e.button === 2) isRightDown = true;
    lastMouse = [e.clientX, e.clientY];

    raymarcher.updateUniforms({
        mouse: [e.clientX, e.clientY, 1, 0],
    });

    // Add little delay
    (async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        const obj = await raymarcher.checkCollision();
        if (obj)
            console.log(`intersected object name: ${obj.name}`);
    })();
});

// --- Mouse up ---
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) isLeftDown = false;
    if (e.button === 2) isRightDown = false;

    raymarcher.updateUniforms({
        mouse: [e.clientX, e.clientY, 0, 0],
    });

});

// --- Mouse move ---
window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastMouse[0];
    const dy = e.clientY - lastMouse[1];
    lastMouse = [e.clientX, e.clientY];

    const orbitSpeed = 0.005;
    const panSpeed = 0.01;

    if (isLeftDown) {
        // Orbit around target
        camera.orbit(dx, dy, orbitSpeed);
        camera.updateMatrices();
    }

    if (isRightDown) {
        // Pan camera and target
        const forward = vec3.create();
        vec3.subtract(forward, camera.target, camera.position);
        vec3.normalize(forward, forward);

        const right = vec3.create();
        vec3.cross(right, forward, camera.up);
        vec3.normalize(right, right);

        const up = vec3.create();
        vec3.cross(up, right, forward);

        // Apply pan
        vec3.scaleAndAdd(camera.position, camera.position, right, -dx * panSpeed);
        vec3.scaleAndAdd(camera.target, camera.target, right, -dx * panSpeed);

        vec3.scaleAndAdd(camera.position, camera.position, up, dy * panSpeed);
        vec3.scaleAndAdd(camera.target, camera.target, up, dy * panSpeed);

        camera.updateMatrices();
    }
});

// --- Wheel (zoom) ---
window.addEventListener('wheel', (e) => {
    camera.zoom(e.deltaY);
    camera.updateMatrices();
});

// --- Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateMatrices();
});

// --- Disable context menu on right click ---
window.addEventListener('contextmenu', (e) => e.preventDefault());

