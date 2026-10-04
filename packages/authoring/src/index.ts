/**
 * @alumieye/eyeviz-authoring
 *
 * Typed, serializable edit commands on EyeViz Scene Specifications, with undo/redo.
 * Renderer- and framework-independent: usable by visual editors, scripts and programs that
 * edit scenes on a user's behalf. Expressions are validated by `@alumieye/eyeviz-core`.
 */
export {
  applyCommand,
  parameterUsers,
  type Changes,
  type EditCommand,
  type EditError,
  type EditErrorCode,
  type EditResult,
} from "./commands";
export {
  SceneDocument,
  type ApplyOptions,
  type DocumentChange,
  type DocumentListener,
  type DocumentOptions,
} from "./document";
export {
  createObject,
  createParameter,
  createStep,
  emptyScene,
  nextPointName,
  uniqueId,
  type NewItemKind,
} from "./templates";
