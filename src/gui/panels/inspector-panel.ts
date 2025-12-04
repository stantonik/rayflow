/*
 * inspector-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import type { GroupPanelPartInitParameters, IContentRenderer, PanelDimensionChangeEvent } from "dockview-core";
import { Utils } from "../../utils";
import { vec3 } from "gl-matrix";

export type InspectorParams = {
    position: vec3,
    rotation: vec3,
    scale: vec3,
    color: vec3,
}

export type InspectorFieldType = "xyz" | "color";

export class InspectorPanel implements IContentRenderer {
    private _parameters!: InspectorParams | null;
    get parameters() { return this._parameters; }
    onFieldChangeCb!: (name: string, type: InspectorFieldType, value: any) => void | null;

    private readonly _element: HTMLElement;
    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");
        this._element.style.color = "white";
        this._element.className = "inspector-panel scrollable";
    }

    init(params: GroupPanelPartInitParameters): void {
        params.params["handler"] = this;
    }

    updateFields(params: InspectorParams | null) {
        this._parameters = params;
        this._element.innerHTML = "";
        if (!params) return;
        const positionField = this.createField("Position", params.position, "xyz");
        const rotationField = this.createField("Rotation", params.rotation, "xyz");
        const scaleField = this.createField("Scale", params.scale, "xyz");
        const colorField = this.createField("Material", params.color, "color");
        this._element.append(positionField, rotationField, scaleField, colorField);
    }

    private createField(
        name: string,
        linked: any,
        type: InspectorFieldType
    ): HTMLElement {
        // Outer field card
        const section = document.createElement("div");
        section.className = "inspector-field";

        // Field title
        const title = document.createElement("p");
        title.textContent = name;
        title.className = "inspector-title";

        // Container for inputs
        const paramDiv = document.createElement("div");
        paramDiv.className = "inspector-params";

        if (type === "xyz") {
            for (let i = 0; i < type.length; ++i) {
                const c = type.charAt(i);
                const wrapper = document.createElement("div");
                wrapper.className = "inspector-input-wrapper";

                const label = document.createElement("label");
                label.textContent = c.toUpperCase();
                label.setAttribute("for", `${c}Input`);
                label.className = "inspector-label";

                const input = document.createElement("input");
                input.type = "number";
                input.name = `${c}Input`;
                input.value = linked[i]?.toString() ?? "0";
                input.className = "inspector-input";

                input.addEventListener("change", () => {
                    linked[i] = parseFloat(input.value);
                    this.onFieldChangeCb?.(name, type, linked);
                });

                wrapper.append(label, input);
                paramDiv.appendChild(wrapper);
            }
        } else if (type === "color") {
            const wrapper = document.createElement("div");
            wrapper.className = "inspector-input-wrapper";

            const label = document.createElement("label");
            label.textContent = "Color";
            label.setAttribute("for", `colorInput`);
            label.className = "inspector-label";

            const input = document.createElement("input");
            input.type = "color";
            input.name = `colorInput`;
            input.value = Utils.rgbToHexStr({r:linked[0], g:linked[1], b:linked[2]});
            input.className = "inspector-color-input";

            input.addEventListener("change", () => {
                const rgb = Utils.hexStrToRgb(input.value) ?? { r: 0, g: 0, b: 0 };
                linked[0] = rgb.r;
                linked[1] = rgb.g;
                linked[2] = rgb.b;
                this.onFieldChangeCb?.(name, type, linked);
            });

            wrapper.append(label, input);
            paramDiv.appendChild(wrapper);
        }

        section.append(title, paramDiv);
        return section;
    }
}

