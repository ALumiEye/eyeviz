import { describe, expect, it } from "vitest";
import { SPEC_VERSION } from "../src/index";

describe("spec version", () => {
  it("is 0.1", () => {
    expect(SPEC_VERSION).toBe("0.1");
  });
});
