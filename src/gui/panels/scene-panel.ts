/*
 * scene-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { Panel } from "./panel";

export class ScenePanel extends Panel {
    canvas!: HTMLCanvasElement;

    setup(): void {
        this.canvas = document.createElement("canvas");
        this._element.appendChild(this.canvas);
    }

    onResize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
    }
}

