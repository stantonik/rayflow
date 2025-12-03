/*
 * inspector-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import type { GroupPanelPartInitParameters, IContentRenderer, PanelDimensionChangeEvent } from "dockview-core";
import { Utils } from "../../utils";

export type InpectorParams = {
    position: { x: number, y: number, z: number },
    rotation: { x: number, y: number, z: number },
    scale: { x: number, y: number, z: number },
    color: { r: number, g: number, b: number },
}

export type InspectorFieldType = "xyz" | "color";

export class InspectorPanel implements IContentRenderer {
    private parameters: InpectorParams;
    private onFieldChangeCb!: (name: string, type: InspectorFieldType, value: any) => void | null;

    private readonly _element: HTMLElement;
    get element() {
        return this._element;
    }

    constructor() {
        this._element = document.createElement("div");
        this._element.style.color = "white";

        this.parameters = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: { r: 255, g: 255, b: 255 },
        };

        const positionField = this.createField("Position", this.parameters.position, "xyz");
        const rotationField = this.createField("Rotation", this.parameters.rotation, "xyz");
        const scaleField = this.createField("Scale", this.parameters.scale, "xyz");
        const colorField = this.createField("Material", this.parameters.color, "color");
        this._element.append(positionField, rotationField, scaleField, colorField);
    }

    init(params: GroupPanelPartInitParameters): void {
        params.api.onDidDimensionsChange((_event: PanelDimensionChangeEvent) => {

        });

        params.api.onDidParametersChange(() => {
            this.onFieldChangeCb = params.api.getParameters()["onFieldChange"] ?? null;
            params.params["parameters"] = this.parameters;
        })

        params.params["parameters"] = this.parameters;
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
            for (const c of type) {
                const key = c as keyof typeof linked;

                const wrapper = document.createElement("div");
                wrapper.className = "inspector-input-wrapper";

                const label = document.createElement("label");
                label.textContent = c.toUpperCase();
                label.setAttribute("for", `${c}Input`);
                label.className = "inspector-label";

                const input = document.createElement("input");
                input.type = "number";
                input.name = `${c}Input`;
                input.value = linked[key]?.toString() ?? "0";
                input.className = "inspector-input";

                input.addEventListener("change", () => {
                    linked[key] = parseFloat(input.value);
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
            input.value = Utils.rgbToHexStr(linked);
            input.className = "inspector-color-input";

            input.addEventListener("change", () => {
                const rgb = Utils.hexStrToRgb(input.value) ?? { r: 0, g: 0, b: 0 };
                linked.r = rgb.r;
                linked.g = rgb.g;
                linked.b = rgb.b;
                this.onFieldChangeCb?.(name, type, linked);
            });

            wrapper.append(label, input);
            paramDiv.appendChild(wrapper);
        }

        section.append(title, paramDiv);
        return section;
    }
}

