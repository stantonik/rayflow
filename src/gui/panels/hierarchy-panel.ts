/*
 * hierarchy-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import type { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";

export class HierarchyPanel implements IContentRenderer {
    private readonly _element: HTMLElement;
    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");
    }

    init(_params: GroupPanelPartInitParameters): void {
    }
} 
