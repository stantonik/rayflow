/*
 * mesh.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

// mesh.ts
export type VertexFormat = {
    // vertex stride in bytes
    stride: number;
    // WebGPU vertex attributes array
    attributes: GPUVertexAttribute[];
};

export class Mesh {
    device: GPUDevice;

    // GPU resources
    vertexBuffer: GPUBuffer;
    indexBuffer?: GPUBuffer;
    indexCount: number = 0;
    indexFormat?: GPUIndexFormat;
    modelBuffer: GPUBuffer; // uniform buffer containing 4x4 model matrix
    bindGroup: GPUBindGroup;

    // CPU-side copies (if needed)
    vertexCount: number = 0;
    vertexStride: number;

    // Usage flags for re-uploads
    private allowsMapping: boolean;

    constructor(
        device: GPUDevice,
        vertices: Float32Array,
        vertexFormat: VertexFormat,
        options?: {
            indices?: Uint16Array | Uint32Array | null;
            usage?: GPUBufferUsageFlags; // extra usage flags for vertex/index buffer
            allowCpuUpdate?: boolean; // whether to keep device buffer mappable for updates (default false)
            label?: string;
        }
    ) {
        this.device = device;
        this.vertexStride = vertexFormat.stride;
        this.allowsMapping = !!options?.allowCpuUpdate;

        const usageBase =
            (options?.usage ?? 0) |
            GPUBufferUsage.VERTEX |
            (this.allowsMapping ? GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_WRITE : GPUBufferUsage.COPY_DST);

        this.vertexCount = vertices.byteLength / this.vertexStride;

        // Create vertex buffer
        this.vertexBuffer = this.createBufferWithData(
            vertices.buffer,
            vertices.byteOffset,
            vertices.byteLength,
            usageBase,
            options?.label ? `${options.label}-vertex` : 'mesh-vertex'
        );

        // Create index buffer (optional)
        if (options?.indices && options.indices.length > 0) {
            const idx = options.indices;
            const isUint32 = idx instanceof Uint32Array || (idx instanceof Uint16Array && idx.BYTES_PER_ELEMENT === 4);
            this.indexFormat = isUint32 ? 'uint32' : 'uint16';
            this.indexCount = idx.length;

            const indexUsage =
                (options?.usage ?? 0) | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;

            this.indexBuffer = this.createBufferWithData(
                idx.buffer,
                idx.byteOffset,
                idx.byteLength,
                indexUsage,
                options?.label ? `${options.label}-index` : 'mesh-index'
            );
        }

        // Create model matrix uniform buffer (4x4 float32 = 16 floats = 64 bytes)
        // Align to 16 bytes is usual; WebGPU requires minUniformBufferOffsetAlignment for dynamic offsets,
        // but a single uniform buffer is fine here.
        const modelBufferSize = 16 * 4; // bytes
        this.modelBuffer = device.createBuffer({
            size: modelBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
            label: options?.label ? `${options.label}-model` : 'mesh-model',
        });

        // Bind group is created later by pipeline-owner (but we can create a default layout here)
        // We'll create a bind group layout and bind group here for simplicity; pipelines must use compatible layout.
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' },
                },
            ],
            label: options?.label ? `${options.label}-bgl` : 'mesh-bgl',
        });

        this.bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.modelBuffer, offset: 0, size: modelBufferSize },
                },
            ],
            label: options?.label ? `${options.label}-bg` : 'mesh-bg',
        });
    }


    private createBufferWithData(
        dataBuffer: ArrayBufferLike,
        byteOffset: number,
        byteLength: number,
        usage: GPUBufferUsageFlags,
        label?: string
    ): GPUBuffer {
        // GPU buffer size must be 4-byte aligned
        const alignedSize = (byteLength + 3) & ~3;

        const gpuBuffer = this.device.createBuffer({
            size: alignedSize,
            usage,
            mappedAtCreation: false,
            label,
        });

        // writeBuffer source must also be 4-byte aligned.
        // We pad into a tmp Uint8Array if needed.
        if (byteLength % 4 === 0) {
            this.device.queue.writeBuffer(
                gpuBuffer,
                0,
                new Uint8Array(dataBuffer as ArrayBuffer, byteOffset, byteLength)
            );
        } else {
            const tmp = new Uint8Array(alignedSize);
            tmp.set(new Uint8Array(dataBuffer, byteOffset, byteLength));
            this.device.queue.writeBuffer(gpuBuffer, 0, tmp);
        }

        return gpuBuffer;
    }

    // Update index data (re-upload)
    updateIndexData(indices: Uint16Array | Uint32Array, dstOffset = 0) {
        if (!this.indexBuffer) {
            // create new index buffer
            const isUint32 = indices instanceof Uint32Array;
            this.indexFormat = isUint32 ? 'uint32' : 'uint16';
            this.indexBuffer = this.createBufferWithData(indices.buffer, indices.byteOffset, indices.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
            this.indexCount = indices.length;
            return;
        }
        this.device.queue.writeBuffer(this.indexBuffer, dstOffset, indices.buffer, indices.byteOffset, indices.byteLength);
        this.indexCount = indices.length;
    }

    // Set model matrix (Float32Array length 16)
    setModelMatrix(matrix4x4: Float32Array) {
        if (matrix4x4.length !== 16) throw new Error('Model matrix must be a Float32Array(16)');
        this.device.queue.writeBuffer(this.modelBuffer, 0, matrix4x4.buffer, matrix4x4.byteOffset, 16 * 4);
    }

    draw(renderPass: GPURenderPassEncoder, bindGroup?: GPUBindGroup) {
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        if (bindGroup) renderPass.setBindGroup(0, bindGroup);
        if (this.indexBuffer) {
            renderPass.setIndexBuffer(this.indexBuffer, this.indexFormat!);
            renderPass.drawIndexed(this.indexCount, 1, 0, 0, 0);
        } else {
            // Use the stored vertex count, not buffer size
            renderPass.draw(this.vertexCount, 1, 0, 0);
        }
    }

    destroy() {
        try {
            this.vertexBuffer.destroy();
        } catch { }
        if (this.indexBuffer) {
            try { this.indexBuffer.destroy(); } catch { }
        }
        try { this.modelBuffer.destroy(); } catch { }
    }
}

