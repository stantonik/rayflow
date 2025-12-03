/*
 * gizmos.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import gizmoWGSL from "./assets/shaders/gizmo.wgsl?raw"
import type { Camera } from "./camera";
import { Mesh, type VertexFormat } from "./mesh";

export class GizmoRenderer {
    private gizmos: Mesh[];
    private camera: Camera;
    private matricesBuffer: GPUBuffer;

    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroup: GPUBindGroup;

    constructor(device: GPUDevice, format: GPUTextureFormat, camera: Camera) {
        this.device = device;
        this.camera = camera;
        this.gizmos = [];

        const vertexFormat: VertexFormat = {
            stride: 6 * 4,
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" }, // position
                { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // color
            ]
        };

        const shader = device.createShaderModule({
            code: gizmoWGSL 
        });

        const vertexLayout: GPUVertexBufferLayout = {
            arrayStride: 6 * 4,
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" },
                { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }
            ],
        };

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: shader, entryPoint: "vs_main", buffers: [vertexLayout] },
            fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
            primitive: { topology: "line-list", cullMode: "none" },
        });

        // Buffers
        this.matricesBuffer = device.createBuffer({
            size: 4 * 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.matricesBuffer } },
            ],
        });

        const vertices = new Float32Array([
            // X axis (red) 
            0, 0, 0, 1, 0, 0,
            1, 0, 0, 1, 0, 0,
            // Y axis (green) 
            0, 0, 0, 0, 1, 0,
            0, 1, 0, 0, 1, 0,
            // Z axis (blue) 
            0, 0, 0, 0, 0, 1,
            0, 0, 1, 0, 0, 1,
        ]);

        const indices = new Uint16Array([
            0, 1,
            2, 3,
            4, 5
        ]);

        const mesh = new Mesh(device, vertices, vertexFormat, {
            indices,
            label: "gizmo"
        });

        this.gizmos.push(mesh);
    }

    render(pass: GPURenderPassEncoder) {
        const camData = new Float32Array(4 * 4);
        camData.set(this.camera.getViewProjMatrix(), 0);
        this.device.queue.writeBuffer(this.matricesBuffer, 0, camData);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        for (const mesh of this.gizmos) {
            mesh.draw(pass);
        }
    }
}
