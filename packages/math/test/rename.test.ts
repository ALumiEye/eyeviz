import { describe, expect, it } from "vitest";
import { renameSymbol } from "../src/index";

describe("renameSymbol", () => {
  it.each([
    ["theta + thetas", "theta", "angle", "angle + thetas"],
    ["2*theta^2 - sin(theta)", "theta", "a", "2*a^2 - sin(a)"],
    ["e + 1e5 + e2", "e2", "k", "e + 1e5 + k"],
    ["x_1 + x", "x", "y", "x_1 + y"],
    ["(  r )*cos(t)", "r", "R", "(  R )*cos(t)"],
    ["r +", "r", "R", "R +"],
  ])("%s: %s → %s", (source, from, to, expected) => {
    expect(renameSymbol(source, from, to)).toBe(expected);
  });

  it("ignores invalid names", () => {
    expect(renameSymbol("a + b", "a", "1x")).toBe("a + b");
    expect(renameSymbol("a + b", "a.b", "c")).toBe("a + b");
  });
});
