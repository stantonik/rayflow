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
    private static globalId = 0;
    private static typeCountsRecord: Map<PrimitiveType, number> = new Map();

    name: string;

    static GPU_DATA_SIZE_WPAD_BYTES: number = 80;
    // GPU
    position: vec3;
    rotation: vec3;
    scale: vec3;
    color: vec3;
    primitive: PrimitiveType;
    readonly id: number;


    _device?: GPUDevice;
    _objectBuffer?: GPUBuffer;
    _index?: number;
    get index() { return this._index; }

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
        this.id = RayObject.generateId();

        // Copy so caller can't mutate shared arrays
        this.position = [...position] as vec3;
        this.rotation = [...rotation] as vec3;
        this.scale = [...scale] as vec3;
        this.color = [...color] as vec3;

        this.primitive = primitive;
        RayObject.typeCountsRecord.set(
            primitive,
            (RayObject.typeCountsRecord.get(primitive) || 0) + 1
        );
    }

    sync(): void {
        if (!this._device || !this._objectBuffer || this._index === undefined) return;

        const offset = this._index * RayObject.GPU_DATA_SIZE_WPAD_BYTES;

        const data = new Float32Array(RayObject.GPU_DATA_SIZE_WPAD_BYTES / 4);
        data.set(this.position, 0);
        data.set(this.rotation, 4);
        data.set(this.scale, 8);
        data.set(this.color, 12);
        data.set([this.primitive, this.id], 16);
        this._device.queue.writeBuffer(
            this._objectBuffer,
            offset,
            data.buffer,
            0,
            data.byteLength
        );
    }

    destroy(): void {
        // Clear GPU references
        this._device = undefined;
        this._objectBuffer = undefined;
        this._index = undefined;

        // Optional: clear arrays to prevent accidental mutation
        this.position = [0, 0, 0];
        this.rotation = [0, 0, 0];
        this.scale = [0, 0, 0];
        this.color = [0, 0, 0];

        // Clear name
        this.name = "";
    }

    private static generateId(): number {
        // Use a global counter combined with a random salt (32-bit integer)
        RayObject.globalId++;
        const randomSalt = Math.floor(Math.random() * 0xffff);
        // Combine: high 16 bits counter, low 16 bits random
        return ((RayObject.globalId & 0xffff) << 16) | (randomSalt & 0xffff);
    }

    static getCountByType(type: PrimitiveType): number {
        return RayObject.typeCountsRecord.get(type) || 0;
    }
}  
