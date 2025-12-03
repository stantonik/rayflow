/*
 * object.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { vec3 } from "gl-matrix";

type PrimitiveType = "sphere" | "cube";

export class Object {
    readonly id: number;
    name: string;

    static GPU_DATA_SIZE_WPAD_BYTES: number = 64;
    position: vec3;
    rotation: vec3;
    scale: vec3;
    color: vec3;
    primitive: PrimitiveType | null;

    _device!: GPUDevice;
    _objectBuffer!: GPUBuffer;
    _objectBufferIdx!: number;

    constructor({
        name = "",
        position = [0, 0, 0],
        rotation = [0, 0, 0],
        scale = [1, 1, 1],
        color = [1, 1, 1],
        primitive = null,
    }: {
        name?: string;
        position?: vec3;
        rotation?: vec3;
        scale?: vec3;
        color?: vec3;
        primitive?: PrimitiveType | null;
    } = {}) {
        this.id = 0;
        this.name = name;

        // Copy so caller can't mutate shared arrays
        this.position = [...position] as vec3;
        this.rotation = [...rotation] as vec3;
        this.scale = [...scale] as vec3;
        this.color = [...color] as vec3;

        this.primitive = primitive;
    }

    sync(): void {
        const offset = this._objectBufferIdx * Object.GPU_DATA_SIZE_WPAD_BYTES;

        const data = new Float32Array(Object.GPU_DATA_SIZE_WPAD_BYTES / 4);
        data.set(this.position, 0);
        data.set(this.rotation, 4);
        data.set(this.scale, 8);
        data.set(this.color, 12);
        this._device.queue.writeBuffer(
            this._objectBuffer,
            offset,
            data.buffer,
            0,
            data.byteLength
        );
    }
}  
