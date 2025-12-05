/*
 * engine.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { vec3 } from "gl-matrix";
import { Camera } from "./webgpu/camera";
import { RayMarcher } from "./webgpu/ray-march";
import { initWebGPU } from "./webgpu/webgpu";
import { PrimitiveType, RayObject } from "./webgpu/ray-object";

export { PrimitiveType }

export const EngineObject = RayObject;
export type EngineObject = RayObject;

export class Engine {
    private device!: GPUDevice;
    private context!: GPUCanvasContext;

    private raymarcher!: RayMarcher;
    private camera!: Camera;

    private _selectedObject: EngineObject | null;
    get selectedObject() { return this._selectedObject; }
    onObjectSelected?: ((obj: EngineObject) => void) | null;
    onObjectUnselected?: ((obj: EngineObject) => void) | null;

    private constructor() {
        this._selectedObject = null;
    }

    static async create(canvas: HTMLCanvasElement): Promise<Engine> {
        const { device, context, format } = await initWebGPU(canvas);


        const engine = new Engine();
        engine.device = device;
        engine.context = context;

        engine.camera = new Camera();
        engine.camera.position = [5, 8, 12];
        engine.raymarcher = new RayMarcher(device, format, engine.camera);

        engine.setupEventListeners(canvas);

        return engine;
    }

    addObject(obj: EngineObject) {
        this.raymarcher.addObject(obj);
    }

    removeObject(obj: EngineObject) {
        this.raymarcher.removeObject(obj);
    }

    selectObject(obj: EngineObject | null) {
        this.raymarcher.selectObject(obj);
        this._selectedObject = obj;
    }

    render(t: number) {
        const encoder = this.device.createCommandEncoder();
        const view = this.context.getCurrentTexture().createView();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view,
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        this.raymarcher.updateUniforms({
            time: t / 1000
        });

        this.raymarcher.render(pass);

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    resize(width: number, height: number) {
        this.raymarcher.updateUniforms({
            resolution: [width, height],
        });
        this.camera.aspect = width / height;
        this.camera.updateMatrices();
    }

    private setupEventListeners(canvas: HTMLCanvasElement) {
        let isLeftDown = false;
        let isRightDown = false;
        let lastMouse: [number, number] = [0, 0];

        // --- Mouse down ---
        canvas.addEventListener('mousedown', (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left);
            const y = (e.clientY - rect.top);

            if (e.button === 0) isLeftDown = true;
            if (e.button === 2) isRightDown = true;
            lastMouse = [x, y];

            this.raymarcher.updateUniforms({
                mouse: [x, y, 1, 0],
            });

            // Add little delay
            (async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 50));

                const obj = await this.raymarcher.checkCollision();
                if (obj) this.onObjectSelected?.(obj);
                else if (this._selectedObject) this.onObjectUnselected?.(this._selectedObject);
                this._selectedObject = obj;
            })();
        });

        // --- Mouse up ---
        canvas.addEventListener('mouseup', (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left);
            const y = (e.clientY - rect.top);

            if (e.button === 0) isLeftDown = false;
            if (e.button === 2) isRightDown = false;

            this.raymarcher.updateUniforms({
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
                this.camera.orbit(dx, dy, orbitSpeed);
                this.camera.updateMatrices();
            }

            if (isRightDown) {
                // Pan camera and target
                const forward = vec3.create();
                vec3.subtract(forward, this.camera.target, this.camera.position);
                vec3.normalize(forward, forward);

                const right = vec3.create();
                vec3.cross(right, forward, this.camera.up);
                vec3.normalize(right, right);

                const up = vec3.create();
                vec3.cross(up, right, forward);

                // Apply pan
                vec3.scaleAndAdd(this.camera.position, this.camera.position, right, -dx * panSpeed);
                vec3.scaleAndAdd(this.camera.target, this.camera.target, right, -dx * panSpeed);

                vec3.scaleAndAdd(this.camera.position, this.camera.position, up, dy * panSpeed);
                vec3.scaleAndAdd(this.camera.target, this.camera.target, up, dy * panSpeed);

                this.camera.updateMatrices();
            }
        });

        // --- Wheel (zoom) ---
        canvas.addEventListener('wheel', (e: WheelEvent) => {
            this.camera.zoom(e.deltaY);
            this.camera.updateMatrices();
        });

        // --- Disable context menu on right click ---
        canvas.addEventListener('contextmenu', (e: any) => e.preventDefault());
    }
}
