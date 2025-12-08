/*
 * camera.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { mat4, vec3, quat, vec4, vec2 } from 'gl-matrix';

export class Camera {
    // Public properties
    public position: vec3 = vec3.fromValues(0, 2, 4);
    public rotation: quat = quat.create();
    public fov: number = 45 * Math.PI / 180;
    public near: number = 0.1;
    public far: number = 100.0;
    public readonly worldUp: vec3 = vec3.fromValues(0, 1, 0);
    public up: vec3 = vec3.create();
    public right: vec3 = vec3.create();
    public forward: vec3 = vec3.create();
    public target: vec3 = vec3.fromValues(0, 0, 0);
    public aspect: number = window.innerWidth / window.innerHeight;

    // Matrices
    private _viewMatrix: mat4 = mat4.create();
    private _projMatrix: mat4 = mat4.create();
    private _viewProjMatrix: mat4 = mat4.create();
    private _invViewProjMatrix: mat4 = mat4.create();

    constructor() {
        this.updateMatrices();
    }

    // Update matrices manually
    public updateMatrices(): void {
        mat4.lookAt(this._viewMatrix, this.position, this.target, this.worldUp);

        const invView = mat4.create();
        mat4.invert(invView, this._viewMatrix);

        // extract world-space camera axes
        this.right = vec3.fromValues(invView[0], invView[1], invView[2]);
        this.up = vec3.fromValues(invView[4], invView[5], invView[6]);
        this.forward = vec3.fromValues(invView[8], invView[9], invView[10]);
        vec3.scale(this.forward, this.forward, -1.0);

        // normalize
        vec3.normalize(this.right, this.right);
        vec3.normalize(this.up, this.up);
        vec3.normalize(this.forward, this.forward);

        mat4.perspective(this._projMatrix, this.fov, this.aspect, this.near, this.far);

        mat4.multiply(this._viewProjMatrix, this._projMatrix, this._viewMatrix);
        mat4.invert(this._invViewProjMatrix, this._viewProjMatrix);
    }

    // Access matrices
    public getViewMatrix(): mat4 {
        return this._viewMatrix;
    }

    public getProjectionMatrix(): mat4 {
        return this._projMatrix;
    }

    public getInvViewProjMatrix(): mat4 {
        return this._invViewProjMatrix;
    }

    public getViewProjMatrix(): mat4 {
        return this._viewProjMatrix;
    }

    worldToScreen(worldPos: vec3, width: number, height: number): vec2 {
        // Convert world → clip space
        const clip = vec4.fromValues(worldPos[0], worldPos[1], worldPos[2], 1);
        vec4.transformMat4(clip, clip, this._viewProjMatrix);

        // Perspective divide
        const ndcX = clip[0] / clip[3];
        const ndcY = clip[1] / clip[3];

        // NDC → screen space
        const out = vec2.create();
        out[0] = (ndcX * 0.5 + 0.5) * width;
        out[1] = (1 - (ndcY * 0.5 + 0.5)) * height; // Y flipped

        return out;
    }


    screenToWorldRay(x: number, y: number, width: number, height: number): { origin: vec3, direction: vec3 } {
        // 1. Convert screen → NDC
        const ndcX = (x / width) * 2 - 1;
        const ndcY = 1 - (y / height) * 2;

        const pNear = vec4.fromValues(ndcX, ndcY, -1, 1);
        const pFar = vec4.fromValues(ndcX, ndcY, 1, 1);

        // 2. Transform to world space
        vec4.transformMat4(pNear, pNear, this._invViewProjMatrix);
        vec4.transformMat4(pFar, pFar, this._invViewProjMatrix);

        // 3. Perspective divide (w)
        vec4.scale(pNear, pNear, 1 / pNear[3]);
        vec4.scale(pFar, pFar, 1 / pFar[3]);

        // 4. Extract vec3
        const origin = vec3.fromValues(pNear[0], pNear[1], pNear[2]);
        const far = vec3.fromValues(pFar[0], pFar[1], pFar[2]);

        // 5. Direction
        const direction = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), far, origin));

        return { origin, direction };
    }

    // Orbit around target
    public orbit(dx: number, dy: number, orbitSpeed: number = 0.005): void {
        const offset = vec3.create();
        vec3.subtract(offset, this.position, this.target);

        let radius = vec3.length(offset);
        let theta = Math.atan2(offset[2], offset[0]);
        let phi = Math.acos(offset[1] / radius);

        theta += dx * orbitSpeed;
        phi -= dy * orbitSpeed;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

        offset[0] = radius * Math.sin(phi) * Math.cos(theta);
        offset[1] = radius * Math.cos(phi);
        offset[2] = radius * Math.sin(phi) * Math.sin(theta);

        vec3.add(this.position, this.target, offset);
    }

    // Zoom along view direction
    public zoom(delta: number, zoomSpeed: number = 0.05, minRadius: number = 1.0, maxRadius: number = 50): void {
        const offset = vec3.create();
        vec3.subtract(offset, this.position, this.target);
        let radius = vec3.length(offset);

        radius += delta * zoomSpeed;
        radius = Math.max(minRadius, Math.min(maxRadius, radius));

        vec3.normalize(offset, offset);
        vec3.scale(offset, offset, radius);
        vec3.add(this.position, this.target, offset);
    }

    // Make camera look at a point
    public lookAt(target: vec3): void {
        vec3.copy(this.target, target);
    }
}

