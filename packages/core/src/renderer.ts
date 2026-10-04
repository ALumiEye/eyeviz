import type { SceneModel } from "./model";
import type { SceneState } from "./state";

/**
 * The contract every EyeViz renderer implements. Renderers consume evaluated state only;
 * they never read raw specs or evaluate expressions. Mounting is renderer-specific
 * (e.g. `new ThreeRenderer(container)`), so it is not part of this interface.
 * See docs/renderer-contract.md.
 */
export interface SceneRenderer {
  /** Builds everything for a (new) model. Called first, and whenever the spec changes. */
  setModel(model: SceneModel, state: SceneState): void;
  /** Applies a new state. `changed` lists the IDs of objects whose state changed. */
  update(state: SceneState, changed: ReadonlySet<string>): void;
  /** Releases every resource. Idempotent; the renderer is unusable afterwards. */
  dispose(): void;
}
