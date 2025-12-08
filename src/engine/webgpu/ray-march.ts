/*
 * ray-march.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import raymarchWGSL from "./shaders/raymarch.wgsl?raw"
import { type vec2, type vec4 } from "gl-matrix";
import type { Camera } from "./camera";
import { RayObject } from "./ray-object";

export type RaymarchUniforms = {
    resolution?: vec2;
    mouse?: vec4;
    time?: number;
    deltaTime?: number;
    picking?: boolean;
    activeObjectIdx?: number;
}

type IntersectItem = {
    type: "gizmo" | "object" | null;
    idx: number;
    object?: RayObject;
}

export class RayMarcher {
    static MAX_OBJECTS: number = 1000;
    static UNIFORMS_SIZE_WPAD_BYTES = 48;

    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroup: GPUBindGroup;

    private lastUniforms: RaymarchUniforms;
    private uniformBuffer: GPUBuffer;

    private objects: RayObject[];
    private objectBuffer: GPUBuffer;
    private objectCountBuffer: GPUBuffer;
    private vertexBuffer: GPUBuffer;

    private lastCollision: IntersectItem | null;
    private collisionPending: boolean;
    private objectHitBuffer: GPUBuffer;
    private objectHitStagingBuffer: GPUBuffer;

    private camera: Camera;
    private cameraBuffer: GPUBuffer;

    private _activeObject!: RayObject | null;
    get activeObject() { return this._activeObject; }

    constructor(device: GPUDevice, format: GPUTextureFormat, camera: Camera) {
        this.device = device;
        this.camera = camera;
        this.lastUniforms = {};
        this.objects = [];
        this.collisionPending = false;
        this.lastCollision = null;

        // Create ray marching display
        const vertices = new Float32Array([
            -1, -1, // bottom-left
            3, -1, // bottom-right
            -1, 3, // top-left
        ]);

        this.vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })

        device.queue.writeBuffer(this.vertexBuffer, 0, vertices, 0, vertices.length);

        const vertexLayout: GPUVertexBufferLayout = {
            arrayStride: 2 * 4,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        };

        const raymarchModule = device.createShaderModule({
            code: raymarchWGSL
        });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: raymarchModule, entryPoint: "vs_main", buffers: [vertexLayout] },
            fragment: { module: raymarchModule, entryPoint: "fs_main", targets: [{ format }] },
            primitive: { topology: "triangle-strip", cullMode: "none" },
        });

        // Uniform & Storage Buffers
        this.uniformBuffer = device.createBuffer({
            size: RayMarcher.UNIFORMS_SIZE_WPAD_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        this.objectBuffer = device.createBuffer({
            size: RayObject.GPU_DATA_SIZE_WPAD_BYTES * 128,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });

        this.objectCountBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.objectHitBuffer = device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.objectHitBuffer, 0, Float32Array.from([-1, -1]).buffer);

        this.objectHitStagingBuffer = device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.cameraBuffer = device.createBuffer({
            size: 4 * 4 * 4 + 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        // Bind Group   

        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.objectBuffer } },
                { binding: 2, resource: { buffer: this.objectCountBuffer } },
                { binding: 3, resource: { buffer: this.objectHitBuffer } },
                { binding: 4, resource: { buffer: this.cameraBuffer } },
            ],
        });
    }

    selectObject(obj: RayObject | null): void {
        this.updateUniforms({
            activeObjectIdx: obj?.index ?? -1
        })
        this._activeObject = obj;
    }

    addObject(obj: RayObject): void {
        // Increase GPU buffer
        if (this.objects.length >= this.objectBuffer.size) {
            const newSize = this.objectBuffer.size * 2;
            const newBuffer = this.device.createBuffer({
                size: newSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            const encoder = this.device.createCommandEncoder();
            encoder.copyBufferToBuffer(
                this.objectBuffer,
                0,
                newBuffer,
                0,
                this.objectBuffer.size
            );
            this.device.queue.submit([encoder.finish()]);

            // Destroy old buffer
            this.objectBuffer.destroy();
            this.objectBuffer = newBuffer;
        }

        // TODO: Validate obj
        obj._objectBuffer = this.objectBuffer;
        obj._device = this.device;
        obj._index = this.objects.length;

        this.objects.push(obj);
        const data = new Uint32Array([this.objects.length]);
        this.device.queue.writeBuffer(this.objectCountBuffer, 0, data.buffer);

        obj.sync();
    }

    removeObject(obj: RayObject): void {
        const idx = obj._index;
        if (idx === undefined || idx < 0 || idx >= this.objects.length) return;

        const lastIdx = this.objects.length - 1;

        if (idx !== lastIdx) {
            // Swap with the last object in array
            const lastObj = this.objects[lastIdx];

            // Update GPU buffer: copy last object data to removed spot
            const encoder = this.device.createCommandEncoder();

            const temp = this.device.createBuffer({
                size: RayObject.GPU_DATA_SIZE_WPAD_BYTES,
                usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });

            encoder.copyBufferToBuffer(
                this.objectBuffer,
                lastIdx * RayObject.GPU_DATA_SIZE_WPAD_BYTES,
                temp,
                0,
                RayObject.GPU_DATA_SIZE_WPAD_BYTES
            );
            encoder.copyBufferToBuffer(
                temp,
                0,
                this.objectBuffer,
                idx * RayObject.GPU_DATA_SIZE_WPAD_BYTES,
                RayObject.GPU_DATA_SIZE_WPAD_BYTES
            );
            this.device.queue.submit([encoder.finish()]);

            temp.destroy();

            // Update last object's indices
            lastObj._index = idx;

            // Replace in CPU array
            this.objects[idx] = lastObj;

            if (this._activeObject === lastObj) {
                this.selectObject(lastObj);
            }
        }

        // Remove last object from CPU array
        this.objects.pop();

        // Update objectCountBuffer
        const data = new Uint32Array([this.objects.length]);
        this.device.queue.writeBuffer(this.objectCountBuffer, 0, data.buffer);

        if (this._activeObject === obj) {
            this.selectObject(null);
        }

        obj.destroy();
    }

    getObjectByName(name: string): RayObject | null {
        return this.objects.find((obj) => obj.name === name) ?? null;
    }

    getObjectById(id: number): RayObject | null {
        return this.objects.find((obj) => obj.id == id) ?? null;
    }

    redeemMemory() {
        // TODO
    }

    updateUniforms(uniforms: RaymarchUniforms) {
        for (const key in uniforms) {
            const value = uniforms[key as keyof RaymarchUniforms];
            if (value !== undefined) {
                // TODO: fix TS error
                (this.lastUniforms as any)[key as keyof RaymarchUniforms] = value;
            }
        }

        const data = new Float32Array(12);

        data.set([...(this.lastUniforms.resolution ?? [0, 0]), 0, 0], 0);
        data.set(this.lastUniforms.mouse ?? [0, 0, 0, 0], 4);
        data.set([
            this.lastUniforms.time ?? 0,
            this.lastUniforms.deltaTime ?? 0,
            this.lastUniforms.picking ? 1 : 0,
            this.lastUniforms.activeObjectIdx ?? -1,
        ], 8);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);
    }

    checkCollision(): IntersectItem | null {
        return this.lastCollision;
    }

    async readCollisionBuffer(): Promise<void> {
        if (this.collisionPending) return;
        this.collisionPending = true;

        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(
            this.objectHitBuffer,
            0,
            this.objectHitStagingBuffer,
            0,
            8
        );
        this.device.queue.submit([encoder.finish()]);

        await this.device.queue.onSubmittedWorkDone()

        await this.objectHitStagingBuffer.mapAsync(GPUMapMode.READ, 0, 8);

        const copyArrayBuffer = this.objectHitStagingBuffer.getMappedRange(0, 8);
        const data = copyArrayBuffer.slice();
        this.objectHitStagingBuffer.unmap();

        this.collisionPending = false;

        const dataArr = new Float32Array(data);
        const type = dataArr[0];
        const intersectedId = dataArr[1];

        console.log()

        let typeStr: string | null;
        switch (type) {
            case 0:
                typeStr = "object"
                break;
            case 1:
                typeStr = "gizmo"
                break;
            default:
            case -1:
                typeStr = null;
                break
        }

        const intersectItem = {
            type: typeStr,
            idx: intersectedId,
        } as IntersectItem;

        if (type == 0) {
            const obj = this.objects[intersectedId];
            intersectItem.object = obj;
        }

        this.lastCollision = intersectItem;
    }

    render(pass: GPURenderPassEncoder) {
        // Update uniforms
        const camData = new Float32Array(4 * 4 + 4);
        camData.set(this.camera.position, 0);
        camData.set(this.camera.getInvViewProjMatrix(), 4);
        this.device.queue.writeBuffer(this.cameraBuffer, 0, camData);

        // Draw
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(3);
    }
}
