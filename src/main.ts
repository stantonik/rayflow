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
import { PanelManager } from "./gui/panel-manager";
import type { InspectorFieldType } from "./gui/panels/inspector-panel";

const app = document.querySelector("#app")! as HTMLElement;

// --- Panels init ---
const panelManager = new PanelManager(app);

const canvas = panelManager.getPanelParam("Scene", "canvas") as HTMLCanvasElement;

// On first Scene load and resize
let sceneLoaded = false;
async function resize(width: number, height: number) {
    if (!sceneLoaded) {
        await start(canvas);
        setupEventListeners(canvas);
        sceneLoaded = true;
    }

    raymarcher.updateUniforms({
        resolution: [width, height],
    });
    camera.aspect = width / height;
    camera.updateMatrices();
}
panelManager.setPanelParam("Scene", "onResize", resize);

// --- 3D Init ---
let device: GPUDevice;
let raymarcher: RayMarcher;
let gizmoRenderer: GizmoRenderer;
let camera: Camera;

async function start(canvas: HTMLCanvasElement) {
    // --- Init WebGPU ---
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error("Could not request GPU adapter.");
    }
    device = await adapter!.requestDevice();
    if (!device) {
        throw Error("Could not request GPU device.");
    }
    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    if (!context) {
        throw Error("Could not request WebGPU canvas context.");
    }
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

    const sphere1 = new Object({ name: "Sphere1" });
    raymarcher.addObject(sphere1);
    const sphere2 = new Object({ name: "Sphere2", scale: [0.1, 0, 0], position: [2, 0, 0] });
    raymarcher.addObject(sphere2);

    const onFieldChange = (name: string, _type: InspectorFieldType, value: any): void | null => {
        if (name === "Position") {
            sphere1.position = [value.x, value.y, value.z];
        } else if (name === "Rotation") {
            sphere1.rotation = [value.x, value.y, value.z];
        } else if (name === "Scale") {
            sphere1.scale = [value.x, value.y, value.z];
        }
        sphere1.sync();
    }
    panelManager.setPanelParam("Inspector", "onFieldChange", onFieldChange);

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

// --- EVENT LISTENERS ---

// Assume `camera` is an instance of Camera
let isLeftDown = false;
let isRightDown = false;
let lastMouse: [number, number] = [0, 0];

function setupEventListeners(canvas: HTMLCanvasElement) {
    // --- Mouse down ---
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (e.button === 0) isLeftDown = true;
        if (e.button === 2) isRightDown = true;
        lastMouse = [x, y];

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
    canvas.addEventListener('mouseup', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (e.button === 0) isLeftDown = false;
        if (e.button === 2) isRightDown = false;

        raymarcher.updateUniforms({
            mouse: [x, y, 0, 0],
        });

    });

    // --- Mouse move ---
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const dx = x - lastMouse[0];
        const dy = y - lastMouse[1];
        lastMouse = [x, y];

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
    canvas.addEventListener('wheel', (e: WheelEvent) => {
        camera.zoom(e.deltaY);
        camera.updateMatrices();
    });

    // --- Disable context menu on right click ---
    canvas.addEventListener('contextmenu', (e: any) => e.preventDefault());
}
