/*
 * utils.ts
 * Copyright (C) 2025 stantonik <stantonik@stantonik-mba.local>
 *
 * Distributed under terms of the MIT license.
 */

 export class Utils {
    static hexStrToRgb(hex: string): { r: number; g: number; b: number } | null {
        // Remove '#' if present
        hex = hex.replace(/^#/, '');

        // Handle shorthand "#abc"
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        if (hex.length !== 6) return null;

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return { r, g, b };
    }

    static rgbToHexStr(rgb: { r: number; g: number; b: number }): string {
        // Clamp each value between 0 and 255, then convert to 2-digit hex
        const rHex = Math.max(0, Math.min(255, rgb.r)).toString(16).padStart(2, '0');
        const gHex = Math.max(0, Math.min(255, rgb.g)).toString(16).padStart(2, '0');
        const bHex = Math.max(0, Math.min(255, rgb.b)).toString(16).padStart(2, '0');

        return `#${rHex}${gHex}${bHex}`;
    }
} 
