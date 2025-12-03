/*
 * scene-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import type { GroupPanelPartInitParameters, IContentRenderer, PanelDimensionChangeEvent } from "dockview-core";

export class ScenePanel implements IContentRenderer {
    canvas: HTMLCanvasElement;
    onResizeCb!: (width: number, height: number) => void;

    private readonly _element: HTMLElement;
    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.canvas.height = 512;
        this._element.appendChild(this.canvas);
    }

    init(params: GroupPanelPartInitParameters): void {
        params.api.onDidDimensionsChange((event: PanelDimensionChangeEvent) => {
            this.canvas.width = event.width;
            this.canvas.height = event.height;
            this.onResizeCb?.(event.width, event.height);
        });

        params.api.onDidParametersChange(() => {
            this.onResizeCb = params.api.getParameters()["onResize"] ?? null;
            params.params["canvas"] = this.canvas;
        })

        params.params["canvas"] = this.canvas;
    }
}

