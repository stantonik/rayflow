/*
 * panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { type IContentRenderer, type GroupPanelPartInitParameters, type ITabRenderer, type TitleEvent, type PanelDimensionChangeEvent } from "dockview-core";

export abstract class Panel implements IContentRenderer {
    protected readonly _element: HTMLElement;

    onResizeCb: ((width: number, height: number) => void) | null = null;

    private _loaded = false;
    get loaded() { return this._loaded; }

    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");
    }

    init(params: GroupPanelPartInitParameters): void {
        params.params["handler"] = this;
        this.setup?.(params);

        params.api.onDidDimensionsChange((event: PanelDimensionChangeEvent) => {
            this.onResize?.(event.width, event.height);
            this.onResizeCb?.(event.width, event.height);
        });
    }

    setup?(params?: GroupPanelPartInitParameters): void;
    onResize?(width: number, height: number): void;
}

export class DefaultTab implements ITabRenderer {
    private readonly _element: HTMLElement;
    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");
        this._element.style.padding = "5px 10px 0 10px";
    }

    init(params: GroupPanelPartInitParameters): void {
        params.api.onDidTitleChange((event: TitleEvent) => {
            this._element.textContent = event.title;
        });
    }
}
