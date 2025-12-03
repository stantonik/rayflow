/*
 * panel-manager.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import '../styles/panels.css'
import 'dockview-core/dist/styles/dockview.css';
import { createDockview, DockviewApi, themeDark, type CreateComponentOptions, type GroupPanelPartInitParameters, type IContentRenderer, type IDockviewPanel, type ITabRenderer, type TitleEvent } from "dockview-core";
import { ScenePanel } from "./panels/scene-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { HierarchyPanel } from "./panels/hierarchy-panel";

class Tab implements ITabRenderer {
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

export type PanelName = "Scene" | "Inspector" | "Hierarchy";

export class PanelManager {
    private api: DockviewApi;
    private panels: IDockviewPanel[];

    constructor(container: HTMLElement) {
        this.api = createDockview(container, {
            theme: themeDark,
            createComponent: (options: CreateComponentOptions): IContentRenderer => {
                switch (options.name) {
                    case "Scene":
                        return new ScenePanel();
                    case "Inspector":
                        return new InspectorPanel();
                    case "Hierarchy":
                        return new HierarchyPanel();
                    default:
                        throw new Error("Panel not found");
                }
            },
            createTabComponent: (_: CreateComponentOptions): ITabRenderer => {
                return new Tab();
            },
        });
        
        this.panels = []

        const scene = this.api.addPanel({
            id: "scene",
            component: "Scene",
            title: "Scene",
            tabComponent: "default"
        })

        const inspector = this.api.addPanel({
            id: "inspector",
            component: "Inspector",
            title: "Inspector",
            tabComponent: "default",
            position: {
                referencePanel: scene,
                direction: "right",
            },
            minimumWidth: 200,
            maximumWidth: 350,
            initialWidth: 250,
        })

        const hierarchy = this.api.addPanel({
            id: "hierarchy",
            component: "Hierarchy",
            title: "Hierarchy",
            tabComponent: "default",
            position: {
                referencePanel: inspector,
                direction: "above",
            },
            minimumWidth: 200,
            maximumWidth: 350,
            initialWidth: 250,
        })

        this.panels.push(scene);
        this.panels.push(inspector);
        this.panels.push(hierarchy);
    }

    getPanelParam(panel: PanelName, param: string): any {
        return this.panels.find((p) => p.api.component === panel)?.params?.[param];
    }

    setPanelParam(panel: PanelName, param: string, value: any): void {
        return this.panels.find((p) => p.api.component === panel)?.api.updateParameters({
            [param]: value
        });
    }
}
