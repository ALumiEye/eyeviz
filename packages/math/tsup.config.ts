import { defineConfig } from "tsup";
import { libraryConfig } from "../../tsup.base";

export default defineConfig(libraryConfig(["esm", "cjs"]));
