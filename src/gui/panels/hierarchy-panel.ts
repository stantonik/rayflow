/*
 * hierarchy-panel.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

import { Panel } from "./panel";


export type ContextMenuItem = {
    text: string;
    callback?: () => void;
    children?: ContextMenuItem[];
};

export type ContextMenu = ContextMenuItem[];

export type HierarchyItem = {
    name: string;
    html?: HTMLElement;
    onClick?: (item: HierarchyItem) => void;
    onActive?: (item: HierarchyItem) => void;
    onLeave?: (item: HierarchyItem) => void;
    onContextMenu?: (item: HierarchyItem, x: number, y: number) => ContextMenu;
    data?: Record<string, any>;
    children?: HierarchyItem[];
};

export class HierarchyPanel extends Panel {
    private listElement!: HTMLElement;

    private _itemList: HierarchyItem[] = [];
    get itemList() { return this._itemList; }
    private itemsMap: Map<string, HTMLElement> = new Map();
    private _activeItem: HierarchyItem | null = null;
    get activeItem() { return this._activeItem; }

    /** Panel-wide context menu callback */
    private panelContextMenuCallback?: (item: { name: string }, x: number, y: number) => ContextMenu;

    constructor() {
        super();

        this._element.classList.add('hierarchy-panel', 'scrollable');

        // Panel-wide right click (on empty space)
        this._element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if ((e.target as HTMLElement).closest('.hierarchy-item')) return;

            const menuItems = this.panelContextMenuCallback?.({ name: 'Hierarchy' }, e.clientX, e.clientY);
            if (menuItems && menuItems.length > 0) {
                this.showContextMenu(menuItems, e.clientX, e.clientY);
            }
        });

        this._element.addEventListener('click', (_) => {
            this.activateItem(null);
        });

        this.showPlaceholder();
    }

    /**
     * Register a panel-wide context menu callback
     */
    onContextMenu(callback: (item: { name: string }, x: number, y: number) => ContextMenu) {
        this.panelContextMenuCallback = callback;
    }

    activateItem(item: HierarchyItem | null): void {
        if (this._activeItem?.html) {
            this._activeItem.html.classList.remove("active");
            this._activeItem.onLeave?.(this._activeItem);
        }
        this._activeItem = item;
        if (item) {
            if (item.html) item.html.classList.add("active");
            item.onActive?.(item);
        }
    }

    /**
     * Add a hierarchy item
     */
    addItem(item: HierarchyItem, parentElement?: HTMLElement) {
        if (this.itemList.length == 0) {
            this._element.innerHTML = "";
            this.listElement = document.createElement('ul');
            this.listElement.classList.add('hierarchy-list');
            this._element.appendChild(this.listElement);
        }

        const li = document.createElement('li');
        li.textContent = item.name;
        li.classList.add('hierarchy-item');
        item.html = li;

        if (item.onClick) li.addEventListener('click', (e) => {
            e.stopPropagation();
            this.activateItem(item);
            item.onClick!(item);
        });

        // Right-click
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const menuItems = item.onContextMenu?.(item, e.clientX, e.clientY);
            if (menuItems && menuItems.length > 0) {
                this.showContextMenu(menuItems, e.clientX, e.clientY);
            }
        });

        const container = parentElement ?? this.listElement;
        container.appendChild(li);

        this.itemsMap.set(item.name, li);

        if (item.children && item.children.length > 0) {
            const childList = document.createElement('ul');
            childList.classList.add('hierarchy-list');
            li.appendChild(childList);

            for (const child of item.children) {
                this.addItem(child, childList);
            }
        }

        this.itemList.push(item);
    }

    /**
    * Remove an item from the hierarchy by reference 
    */
    removeItem(item: HierarchyItem) {
        const li = this.itemsMap.get(item.name);
        if (li) {
            li.remove();               // remove from DOM
            this.itemsMap.delete(item.name); // remove from internal map
        }
        const index = this.itemList.indexOf(item);
        if (index > -1) this.itemList.splice(index, 1);
        if (this.itemList.length == 0) {
            this.showPlaceholder();
        }
    }

    private showPlaceholder() {
        this._element.innerHTML = "";
        const placeHolder = document.createElement("div");
        placeHolder.textContent = "Scene is empty";
        placeHolder.classList.add("placeholder");
        this._element.appendChild(placeHolder);
        return;
    }

    /**
     * Show context menu from an array of items
     */

    private showContextMenu(items: ContextMenu, x: number, y: number) {
        // Remove existing menus
        const existing = document.getElementById('hierarchy-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'hierarchy-context-menu';
        menu.classList.add('hierarchy-context-menu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        items.forEach(item => {
            const option = document.createElement('div');
            option.classList.add('hierarchy-context-menu-item');
            option.textContent = item.text;
            menu.appendChild(option);

            // If the item has a callback
            if (item.callback) {
                option.addEventListener('click', () => {
                    item.callback!();
                    menu.remove();
                });
            }

            // If the item has children (nested menu)
            if (item.children && item.children.length > 0) {
                option.classList.add('has-children');

                // Create submenu
                const subMenu = document.createElement('div');
                subMenu.classList.add('hierarchy-context-submenu');
                subMenu.style.display = 'none';
                option.appendChild(subMenu);

                // Recursively add submenu items
                this.buildSubMenu(subMenu, item.children);

                option.addEventListener('mouseenter', () => {
                    this.positionSubMenu(subMenu, option);
                    subMenu.style.display = 'block';
                });
                option.addEventListener('mouseleave', () => {
                    subMenu.style.display = 'none';
                });
            }
        });

        document.body.appendChild(menu);

        // Close on outside click
        document.addEventListener('click', () => menu.remove(), { once: true });
    }

    private buildSubMenu(container: HTMLElement, items: ContextMenu) {
        items.forEach(item => {
            const option = document.createElement('div');
            option.classList.add('hierarchy-context-menu-item');
            option.textContent = item.text;
            container.appendChild(option);

            if (item.callback) {
                option.addEventListener('click', () => {
                    item.callback!();
                    container.closest('#hierarchy-context-menu')?.remove();
                });
            }

            if (item.children && item.children.length > 0) {
                option.classList.add('has-children');
                const subMenu = document.createElement('div');
                subMenu.classList.add('hierarchy-context-submenu');
                subMenu.style.display = 'none';
                option.appendChild(subMenu);
                this.buildSubMenu(subMenu, item.children);
            }
        });
    }


    private positionSubMenu(subMenu: HTMLElement, parentItem: HTMLElement) {
        const parentRect = parentItem.getBoundingClientRect();
        const menuRect = subMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = parentRect.width; // default: right
        let top = 0;

        // flip left if overflow
        if (parentRect.right + menuRect.width > viewportWidth) {
            left = -menuRect.width;
        }

        // adjust vertical if overflow
        if (parentRect.top + menuRect.height > viewportHeight) {
            top = viewportHeight - menuRect.height - parentRect.top;
        }

        subMenu.style.left = `${left}px`;
        subMenu.style.top = `${top}px`;
    }


}

