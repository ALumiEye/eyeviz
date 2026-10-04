import { describe, expect, it } from "vitest";
import { SPEC_VERSION } from "@alumieye/eyeviz-spec";
import { SUPPORTED_SPEC_VERSIONS } from "../src/index";

describe("core", () => {
  it("resolves the spec package from source and supports its version", () => {
    expect(SUPPORTED_SPEC_VERSIONS).toContain(SPEC_VERSION);
  });
});
