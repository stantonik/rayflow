/*
 * panel-manager.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import '../styles/panels.css'
import 'dockview-core/dist/styles/dockview.css';
import { createDockview, DockviewApi, themeDark, type CreateComponentOptions, type IContentRenderer, type ITabRenderer } from "dockview-core";
import { ScenePanel } from "./panels/scene-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { HierarchyPanel } from "./panels/hierarchy-panel";
import { type Panel, DefaultTab } from './panels/panel';
import { Utils } from '../utils';

export class PanelManager {
    private api: DockviewApi;
    private panelHandlers: Panel[];

    constructor(container: HTMLElement) {
        this.panelHandlers = []

        const scenePanel = new ScenePanel();
        const inspectorPanel = new InspectorPanel();
        const hierarchyPanel = new HierarchyPanel();
        this.panelHandlers.push(scenePanel);
        this.panelHandlers.push(inspectorPanel);
        this.panelHandlers.push(hierarchyPanel);

        this.api = createDockview(container, {
            theme: themeDark,
            createComponent: (options: CreateComponentOptions): IContentRenderer => {
                switch (options.name) {
                    case "Scene":
                        return scenePanel;
                    case "Inspector":
                        return inspectorPanel;
                    case "Hierarchy":
                        return hierarchyPanel;
                    default:
                        throw new Error("Panel not found");
                }
            },
            createTabComponent: (options: CreateComponentOptions): ITabRenderer => {
                switch (options.name) {
                    case "default":
                        return new DefaultTab();
                    default:
                        throw new Error("Tab not found");
                }
            },
        });
    }

    async initLayout(): Promise<void> {
        // --- Scene ---
        const scene = this.api.addPanel({
            id: "scene",
            component: "Scene",
            title: "Scene",
            tabComponent: "default"
        });

        // --- Inspector ---
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
        });

        // --- Hierarchy ---
        this.api.addPanel({
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
        });

        await Utils.sleep(50); // Delay for all panels to be init
    }

    getPanel<T extends Panel>(cls: new (...args: any[]) => T): T | null {
        for (const p of this.panelHandlers) {
            if (p instanceof cls) {
                return p as T;
            }
        }
        return null;
    }
}
