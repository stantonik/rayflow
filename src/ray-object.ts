/*
 * ray-object.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { vec3 } from "gl-matrix";

export const PrimitiveType = {
    // Core 3D SDF primitives
    SPHERE: 0,
    ELLIPSOID: 0,

    BOX: 1,
    CUBOID: 1,

    TORUS: 2,
    CYLINDER: 3,
    CONE: 4,
    CAPSULE: 5,
} as const;

export type PrimitiveType = typeof PrimitiveType[keyof typeof PrimitiveType];

export class RayObject {
    name: string;

    static GPU_DATA_SIZE_WPAD_BYTES: number = 80;
    // GPU
    position: vec3;
    rotation: vec3;
    scale: vec3;
    color: vec3;
    _id!: number;
    primitive: PrimitiveType;

    get id() { return this._id; }

    _device!: GPUDevice;
    _objectBuffer!: GPUBuffer;
    _objectBufferIdx!: number;

    constructor({
        name = "",
        position = [0, 0, 0],
        rotation = [0, 0, 0],
        scale = [1, 1, 1],
        color = [1, 1, 1],
        primitive = PrimitiveType.CUBOID,
    }: {
        name?: string;
        position?: vec3;
        rotation?: vec3;
        scale?: vec3;
        color?: vec3;
        primitive?: PrimitiveType;
    } = {}) {
        this.name = name;

        // Copy so caller can't mutate shared arrays
        this.position = [...position] as vec3;
        this.rotation = [...rotation] as vec3;
        this.scale = [...scale] as vec3;
        this.color = [...color] as vec3;

        this.primitive = primitive;
    }

    sync(): void {
        const offset = this._objectBufferIdx * RayObject.GPU_DATA_SIZE_WPAD_BYTES;

        const data = new Float32Array(RayObject.GPU_DATA_SIZE_WPAD_BYTES / 4);
        data.set(this.position, 0);
        data.set(this.rotation, 4);
        data.set(this.scale, 8);
        data.set(this.color, 12);
        data.set([this.primitive, this._id], 16);
        this._device.queue.writeBuffer(
            this._objectBuffer,
            offset,
            data.buffer,
            0,
            data.byteLength
        );
    }
}  
