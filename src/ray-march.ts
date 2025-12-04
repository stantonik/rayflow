/*
 * ray-march.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { Mesh, type VertexFormat } from "./mesh";
import raymarchWGSL from "./assets/shaders/raymarch.wgsl?raw"
import { type vec2, type vec4 } from "gl-matrix";
import type { Camera } from "./camera";
import { RayObject } from "./ray-object";

export type RaymarchUniforms = {
    resolution?: vec2;
    mouse?: vec4;
    time?: number;
    deltaTime?: number;
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
    private objectHitBuffer: GPUBuffer;
    private objectHitStagingBuffer: GPUBuffer;

    private camera: Camera;
    private cameraBuffer: GPUBuffer;

    private mesh: Mesh;

    private _lastIntersectedObj!: RayObject | null;
    get lastIntersectedObj() { return this._lastIntersectedObj; }

    constructor(device: GPUDevice, format: GPUTextureFormat, camera: Camera) {
        this.device = device;
        this.camera = camera;
        this.lastUniforms = {};
        this.objects = [];

        const vertexFormat: VertexFormat = {
            stride: 2 * 4,
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2" }
            ]
        };

        const raymarchModule = device.createShaderModule({
            code: raymarchWGSL
        });

        const vertexLayout: GPUVertexBufferLayout = {
            arrayStride: 2 * 4,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        };

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: raymarchModule, entryPoint: "vs_main", buffers: [vertexLayout] },
            fragment: { module: raymarchModule, entryPoint: "fs_main", targets: [{ format }] },
            primitive: { topology: "triangle-strip", cullMode: "none" },
        });

        // Buffers
        this.uniformBuffer = device.createBuffer({
            size: RayMarcher.UNIFORMS_SIZE_WPAD_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        this.objectBuffer = device.createBuffer({
            size: RayObject.GPU_DATA_SIZE_WPAD_BYTES * 128,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.objectCountBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.objectHitBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.objectHitBuffer, 0, Float32Array.from([-1]).buffer);

        this.objectHitStagingBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.cameraBuffer = device.createBuffer({
            size: 4 * 4 * 4 + 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

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

        // Create Mesh
        const vertices = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);

        this.mesh = new Mesh(device, vertices, vertexFormat, {
            indices: null,
            label: "fullscreen-quad"
        });
    }

    selectObject(obj: RayObject): void {
        this.device.queue.writeBuffer(this.objectHitBuffer, 0, Float32Array.from([obj.id]).buffer);
        this._lastIntersectedObj = obj;
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
        obj._objectBufferIdx = this.objects.length;
        obj._index = this.objects.length;

        this.objects.push(obj);
        const data = new Uint32Array([this.objects.length]);
        this.device.queue.writeBuffer(this.objectCountBuffer, 0, data.buffer);

        obj.sync();
    }

    removeObject(obj: RayObject): void {
        const idx = obj._objectBufferIdx;
        if (idx === undefined || idx < 0 || idx >= this.objects.length) return;

        const lastIdx = this.objects.length - 1;

        if (idx !== lastIdx) {
            // Swap with the last object in array
            const lastObj = this.objects[lastIdx];

            // Update GPU buffer: copy last object data to removed spot
            const encoder = this.device.createCommandEncoder();
            encoder.copyBufferToBuffer(
                lastObj._objectBuffer!,
                lastIdx * RayObject.GPU_DATA_SIZE_WPAD_BYTES,
                obj._objectBuffer!,
                idx * RayObject.GPU_DATA_SIZE_WPAD_BYTES,
                RayObject.GPU_DATA_SIZE_WPAD_BYTES
            );
            this.device.queue.submit([encoder.finish()]);

            // Update last object's indices
            lastObj._objectBufferIdx = idx;

            // Replace in CPU array
            this.objects[idx] = lastObj;
        }

        // Remove last object from CPU array
        this.objects.pop();

        // Update objectCountBuffer
        const data = new Uint32Array([this.objects.length]);
        this.device.queue.writeBuffer(this.objectCountBuffer, 0, data.buffer);

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

        // resolution.xy + padding
        data.set([...(this.lastUniforms.resolution ?? [0, 0]), 0, 0], 0);

        // mouse.xyzw
        data.set(this.lastUniforms.mouse ?? [0, 0, 0, 0], 4);

        // time, deltaTime + padding
        data.set([this.lastUniforms.time ?? 0, this.lastUniforms.deltaTime ?? 0, 0, 0], 8);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);
    }

    async checkCollision(): Promise<RayObject | null> {
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(
            this.objectHitBuffer,          // source: GPU-written storage buffer
            0,               // source offset
            this.objectHitStagingBuffer,   // destination buffer
            0,               // destination offset
            4
        );
        this.device.queue.submit([encoder.finish()]);
        await this.objectHitStagingBuffer.mapAsync(
            GPUMapMode.READ,
            0, // Offset
            4, // Length, in bytes
        );

        const copyArrayBuffer = this.objectHitStagingBuffer.getMappedRange(0, 4);
        const data = copyArrayBuffer.slice();
        this.objectHitStagingBuffer.unmap();
        const dataArr = new Float32Array(data);
        const intersectedId = dataArr[0];

        const obj = this.getObjectById(intersectedId);
        this._lastIntersectedObj = obj;
        return obj;
    }

    render(pass: GPURenderPassEncoder) {
        const camData = new Float32Array(4 * 4 + 4);
        camData.set(this.camera.position, 0);
        camData.set(this.camera.getInvViewProjMatrix(), 4);
        this.device.queue.writeBuffer(this.cameraBuffer, 0, camData);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        this.mesh.draw(pass);
    }
}
