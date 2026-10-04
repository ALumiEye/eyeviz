import { describe, expect, it } from "vitest";
import { SUPPORTED_CONSTANTS, SUPPORTED_FUNCTIONS } from "../src/index";

describe("expression whitelist", () => {
  it("has no duplicates and no overlap between functions and constants", () => {
    const names = [...SUPPORTED_FUNCTIONS, ...SUPPORTED_CONSTANTS];
    expect(new Set(names).size).toBe(names.length);
  });
});
