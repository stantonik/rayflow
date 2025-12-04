/*
 * main.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import "./styles/style.css"
import { vec3 } from "gl-matrix";
import { RayMarcher } from "./ray-march";
import { Camera } from "./camera";
import { RayObject, PrimitiveType } from "./ray-object";
import { PanelManager } from "./gui/panel-manager";
import { InspectorPanel, type InspectorFieldType, type InspectorParams } from "./gui/panels/inspector-panel";
import { HierarchyPanel, type ContextMenu, type HierarchyItem } from "./gui/panels/hierarchy-panel";
import { ScenePanel } from "./gui/panels/scene-panel";

// --- ENTRY POINT ---
const app = document.querySelector("#app")! as HTMLElement;

// --- Panels init ---
const panelManager = new PanelManager(app);

await panelManager.initLayout();

const inpectorPanel = panelManager.getPanel(InspectorPanel)!;
const scenePanel = panelManager.getPanel(ScenePanel)!;
const hierarchyPanel = panelManager.getPanel(HierarchyPanel)!;

// Panels callback setup
inpectorPanel.onFieldChangeCb = (name: string, _type: InspectorFieldType, value: any): void | null => {
    const obj = raymarcher.lastIntersectedObj;
    if (!obj) {
        return;
    }
    if (name === "Position") {
        obj.position = value;
    } else if (name === "Rotation") {
        obj.rotation = value;
    } else if (name === "Scale") {
        obj.scale = value;
    } else if (name === "Material") {
        obj.color = [value[0] / 255, value[1] / 255, value[2] / 255];
    }
    obj.sync();
}

const inspectorInspect = (obj: RayObject | null) => {
    let params: InspectorParams | null = null;

    if (obj) {
        params = {
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale,
            color: [obj.color[0] * 255, obj.color[1] * 255, obj.color[2] * 255],
        } as InspectorParams;
    }

    inpectorPanel.updateFields(params);
}

const itemCtxMenu = (item: HierarchyItem) => {
    return [
        {
            text: `Remove ${item.name}`, callback: () => {
                raymarcher.removeObject(item.data?.["objectRef"]);
                hierarchyPanel.removeItem(item);
            }
        }
    ] as ContextMenu;
}

const itemOnClick = (item: HierarchyItem) => {
    const obj = item.data?.["objectRef"] as RayObject;
    if (obj) {
        raymarcher.selectObject(obj);
        inspectorInspect(obj);
    }
}

hierarchyPanel.onContextMenu((): ContextMenu => {
    const formatPrimitiveName = (name: string): string => {
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
    const primitiveNames = Object.keys(PrimitiveType) as (keyof typeof PrimitiveType)[];
    const primitiveMenuItems: ContextMenu = primitiveNames.map((name) => ({
        text: formatPrimitiveName(name),
        callback: () => {
            const primitiveValue: PrimitiveType = PrimitiveType[name];
            const obj = new RayObject({
                primitive: primitiveValue
            });
            raymarcher.addObject(obj);
            obj.name = `${formatPrimitiveName(name)}${RayObject.getCountByType(obj.primitive)}`;

            hierarchyPanel.addItem({
                name: obj.name,
                onClick: itemOnClick,
                onContextMenu: itemCtxMenu,
                data: { objectRef: obj }
            });
        }
    }));

    return [
        {
            text: 'Create new primitive',
            children: primitiveMenuItems
        }
    ];
});

// --- 3D Init ---
let device: GPUDevice;
let raymarcher: RayMarcher;
let camera: Camera;

const canvas = scenePanel.canvas;
await start(canvas);

resize(canvas.width, canvas.height);
scenePanel.onResizeCb = resize;

setupEventListeners(canvas);

// --- Function definitions ---
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
    camera.position = [5, 8, 12];
    raymarcher = new RayMarcher(device, format, camera);

    // const testMesh = OBJLoader.parseToMesh((await import("./assets/gizmos/cone.obj?raw")).default, device);
    // testMesh.setModelMatrix(model);

    // Default Object
    const cube = new RayObject({ name: "Cube", color: [0.2, 0.8, 0.2] });
    raymarcher.addObject(cube);
    hierarchyPanel.addItem({
        name: cube.name,
        onClick: itemOnClick,
        onContextMenu: itemCtxMenu,
        data: { objectRef: cube }
    });

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

function resize(width: number, height: number) {
    raymarcher.updateUniforms({
        resolution: [width, height],
    });
    camera.aspect = width / height;
    camera.updateMatrices();
}

function setupEventListeners(canvas: HTMLCanvasElement) {
    // --- Mouse down ---
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

        if (e.button === 0) isLeftDown = true;
        if (e.button === 2) isRightDown = true;
        lastMouse = [x, y];

        raymarcher.updateUniforms({
            mouse: [x, y, 1, 0],
        });

        // Add little delay
        (async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 50));

            const obj = await raymarcher.checkCollision();
            if (obj) {
                console.log(`intersected object name: ${obj.name}`);
            }
            inspectorInspect(obj);
        })();
    });

    // --- Mouse up ---
    canvas.addEventListener('mouseup', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

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
    window.addEventListener('contextmenu', (e: any) => e.preventDefault());
}
