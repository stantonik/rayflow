/*
 * main.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import "./styles/style.css"
import { PanelManager } from "./gui/panel-manager";
import { InspectorPanel, type InspectorFieldType, type InspectorParams } from "./gui/panels/inspector-panel";
import { HierarchyPanel, type ContextMenu, type HierarchyItem } from "./gui/panels/hierarchy-panel";
import { ScenePanel } from "./gui/panels/scene-panel";

import { Engine, EngineObject, PrimitiveType } from "./engine/engine";

// --- ENTRY POINT ---
const app = document.querySelector("#app")! as HTMLElement;

// --- Panels init ---
const panelManager = new PanelManager(app);

await panelManager.initLayout();

const inpectorPanel = panelManager.getPanel(InspectorPanel)!;
const scenePanel = panelManager.getPanel(ScenePanel)!;
const hierarchyPanel = panelManager.getPanel(HierarchyPanel)!;


// --- Engine Init ---
const canvas = scenePanel.canvas;
const engine = await Engine.create(canvas);
engine.resize(canvas.width, canvas.height);
engine.setPicking(true);

// Default object
addObject(new EngineObject({ name: "Cube", color: [0.2, 0.8, 0.2] }), false);

// --- Render Loop ---
const animate = (t: number) => {
    engine.render(t);
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);


// --- EVENT LISTENERS ---
// Engine callback setup
engine.onObjectSelected = (obj) => {
    console.log(`intersected object name: ${obj.name}`);
    const item = hierarchyPanel.itemList.find(item => item.data?.["objectRef"] === obj) ?? null;
    hierarchyPanel.activateItem(item);
}

engine.onObjectUnselected = (obj) => {
    console.log(`unselected : ${obj.name}`);
    hierarchyPanel.activateItem(null);
}

engine.onObjectEdited = (obj) => {
    inspectorInspect(obj);
}

// Panels callback setup
scenePanel.onResizeCb = (width, height) => { engine.resize(width, height) };

inpectorPanel.onFieldChangeCb = (name: string, _type: InspectorFieldType, value: any): void | null => {
    const obj = engine.selectedObject;
    if (!obj) {
        return;
    }
    if (name === "Position") {
        obj.position = value;
    } else if (name === "Rotation") {
        obj.rotation = value;
    } else if (name === "Scale") {
        obj.scale = value;
    } else if (name === "Material") {
        obj.color = [value[0] / 255, value[1] / 255, value[2] / 255];
    }
    obj.sync();
}

function inspectorInspect(obj: EngineObject | null) {
    let params: InspectorParams | null = null;

    if (obj) {
        params = {
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale,
            color: [obj.color[0] * 255, obj.color[1] * 255, obj.color[2] * 255],
        } as InspectorParams;
    }

    inpectorPanel.updateFields(params);
}

function itemCtxMenu(item: HierarchyItem) {
    return [
        {
            text: `Remove ${item.name}`, callback: () => {
                engine.removeObject(item.data?.["objectRef"]);
                if (hierarchyPanel.activeItem === item) {
                    inspectorInspect(null);
                }
                hierarchyPanel.removeItem(item);
            }
        },
        {
            text: `Copy ${item.name}`, callback: () => {
                const obj = item.data?.["objectRef"] as EngineObject;
                addObject(obj?.copy());
            }
        }
    ] as ContextMenu;
}

function itemOnClick(item: HierarchyItem) {
    const obj = item.data?.["objectRef"] as EngineObject;
    if (obj) {
        inspectorInspect(obj);
    }
}

function itemOnActive(item: HierarchyItem) {
    const obj = item.data?.["objectRef"] as EngineObject;
    if (obj) {
        engine.selectObject(obj);
        inspectorInspect(obj);
    }
}

function itemOnLeave() {
    engine.selectObject(null);
    inspectorInspect(null);
}

hierarchyPanel.onContextMenu((): ContextMenu => {
    const formatPrimitiveName = (name: string): string => {
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
    const primitiveNames = Object.keys(PrimitiveType) as (keyof typeof PrimitiveType)[];
    const primitiveMenuItems: ContextMenu = primitiveNames.map((name) => ({
        text: formatPrimitiveName(name),
        callback: () => {
            const primitiveValue: PrimitiveType = PrimitiveType[name];
            const obj = new EngineObject({
                primitive: primitiveValue
            });
            obj.name = `${formatPrimitiveName(name)}${EngineObject.getCountByType(obj.primitive)}`;

            addObject(obj);
        }
    }));

    return [
        {
            text: 'Create new primitive',
            children: primitiveMenuItems
        }
    ];
});

function addObject(obj: EngineObject, active: boolean = true) {
    engine.addObject(obj);

    const item = {
        name: obj.name,
        onClick: itemOnClick,
        onActive: itemOnActive,
        onLeave: itemOnLeave,
        onContextMenu: itemCtxMenu,
        data: { objectRef: obj }
    };

    hierarchyPanel.addItem(item);
    if (active) hierarchyPanel.activateItem(item);
}

// --- Disable context menu on right click ---
window.addEventListener('contextmenu', (e: any) => e.preventDefault());
