import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export interface LabelStyle {
  readonly color: number;
  readonly halo: number;
  readonly size: number;
  readonly weight?: number;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/**
 * A text label rendered as a DOM element over the canvas: crisp at any zoom, selectable, and
 * readable by assistive technology. Text is always set with `textContent`, never as HTML.
 * Styles are set through the CSSOM (no `<style>` injection), which keeps strict CSPs working.
 */
export function createLabel(text: string, style: LabelStyle): CSS2DObject {
  const element = document.createElement("span");
  element.textContent = text;
  applyLabelStyle(element, style);
  element.style.font = `${style.weight ?? 500} ${style.size}px ui-sans-serif, system-ui, sans-serif`;
  element.style.whiteSpace = "nowrap";
  element.style.pointerEvents = "none";
  element.style.userSelect = "none";
  element.style.padding = "0 3px";
  const object = new CSS2DObject(element);
  // Anchor the label's lower-left corner at the point, so it sits up and to the right.
  object.center.set(0, 1);
  return object;
}

export function applyLabelStyle(element: HTMLElement, style: LabelStyle): void {
  element.style.color = hex(style.color);
  const h = hex(style.halo);
  element.style.textShadow = `0 0 2px ${h}, 0 0 2px ${h}, 0 0 3px ${h}`;
}
