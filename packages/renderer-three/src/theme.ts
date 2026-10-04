/** Visual defaults. Clean, readable, and distinct per object type; no product branding. */
export interface Palette {
  readonly background: number;
  readonly point: number;
  readonly segment: number;
  readonly curve: number;
  readonly vector: number;
  readonly plane: number;
  readonly surface: number;
  readonly label: number;
  /** Outline behind label text, for contrast against any background. */
  readonly labelHalo: number;
  readonly tickLabel: number;
  /** Emphasis colour for highlighted and selected objects. */
  readonly highlight: number;
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
    vector: 0x7048e8,
    plane: 0x12b886,
    surface: 0x4dabf7,
    label: 0x212529,
    labelHalo: 0xffffff,
    tickLabel: 0x868e96,
    highlight: 0xf08c00,
    grid: 0xe9ecef,
    gridCenter: 0xced4da,
    axes: [0xe03131, 0x2f9e44, 0x1971c2],
  },
  dark: {
    background: 0x141517,
    point: 0xff922b,
    segment: 0xdee2e6,
    curve: 0x4dabf7,
    vector: 0x9775fa,
    plane: 0x38d9a9,
    surface: 0x339af0,
    label: 0xf1f3f5,
    labelHalo: 0x141517,
    tickLabel: 0x909296,
    highlight: 0xffd43b,
    grid: 0x25262b,
    gridCenter: 0x373a40,
    axes: [0xff6b6b, 0x69db7c, 0x74c0fc],
  },
});

/** Resolves `"auto"` against the user's color-scheme preference (light when unknown). */
export function resolveTheme(option: ThemeOption, prefersDark: boolean): ThemeName {
  return option === "auto" ? (prefersDark ? "dark" : "light") : option;
}
