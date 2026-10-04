/** Visual defaults. Clean, readable, and distinct per object type; no product branding. */
export interface Palette {
  readonly background: number;
  readonly point: number;
  readonly segment: number;
  readonly curve: number;
  readonly grid: number;
  readonly gridCenter: number;
  readonly axes: readonly [x: number, y: number, z: number];
}

export type ThemeName = "light" | "dark";
export type ThemeOption = ThemeName | "auto";

export const PALETTES: Readonly<Record<ThemeName, Palette>> = Object.freeze({
  light: {
    background: 0xffffff,
    point: 0xe8590c,
    segment: 0x343a40,
    curve: 0x1c7ed6,
    grid: 0xe9ecef,
    gridCenter: 0xced4da,
    axes: [0xe03131, 0x2f9e44, 0x1971c2],
  },
  dark: {
    background: 0x141517,
    point: 0xff922b,
    segment: 0xdee2e6,
    curve: 0x4dabf7,
    grid: 0x25262b,
    gridCenter: 0x373a40,
    axes: [0xff6b6b, 0x69db7c, 0x74c0fc],
  },
});

/** Resolves `"auto"` against the user's color-scheme preference (light when unknown). */
export function resolveTheme(option: ThemeOption, prefersDark: boolean): ThemeName {
  return option === "auto" ? (prefersDark ? "dark" : "light") : option;
}
