/*
 * webgpu.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat }> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error("Could not request GPU adapter.");
    }
    const device = await adapter!.requestDevice();
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

    return { device, context, format };
}  
