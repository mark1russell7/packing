// The regions of the pages: the bounding box and the SVG element of a region of the contract.

import type { Region } from "@mark1russell7/packing";

/** This function gives the bounding box of a region. */
export function regionBounds(r: Region): { x: number; y: number; w: number; h: number } {
  switch (r.kind) {
    case "rect":
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    case "circle":
      return { x: r.cx - r.r, y: r.cy - r.r, w: 2 * r.r, h: 2 * r.r };
    case "ellipse":
      return { x: r.cx - r.rx, y: r.cy - r.ry, w: 2 * r.rx, h: 2 * r.ry };
    case "polygon": {
      const xs = r.points.map((p) => p[0]);
      const ys = r.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  }
}

/** This function gives the SVG element of a region, with a class. */
export function regionSvg(r: Region, cls: string): string {
  switch (r.kind) {
    case "rect":
      return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />`;
    case "circle":
      return `<circle class="${cls}" cx="${r.cx}" cy="${r.cy}" r="${r.r}" />`;
    case "ellipse":
      return `<ellipse class="${cls}" cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}" />`;
    case "polygon": {
      const ring = (pts: readonly (readonly [number, number])[]): string => `M${pts.map((p) => `${p[0]},${p[1]}`).join("L")}Z`;
      return `<path class="${cls}" fill-rule="evenodd" d="${[r.points, ...(r.holes ?? [])].map(ring).join("")}" />`;
    }
  }
}
