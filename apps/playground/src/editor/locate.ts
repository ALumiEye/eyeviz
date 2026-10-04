import { findNodeAtLocation, parseTree, type Segment } from "jsonc-parser";

export interface TextRange {
  readonly offset: number;
  readonly length: number;
}

/** `"objects[2].position[0]"` → `["objects", 2, "position", 0]`. */
export function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  for (const match of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (match[2] !== undefined) segments.push(Number(match[2]));
    else if (match[1] !== undefined) segments.push(match[1]);
  }
  return segments;
}

/**
 * Finds the text range of an issue path inside the JSON source. With `key`, highlights that
 * property's name (e.g. an unknown field). Otherwise falls back to the closest existing
 * ancestor (e.g. the object that is missing a field).
 */
export function locate(text: string, path: string, key?: string): TextRange {
  const root = parseTree(text);
  if (!root) return { offset: 0, length: 0 };
  const segments = parsePath(path);

  if (key !== undefined) {
    const property = findNodeAtLocation(root, [...segments, key])?.parent;
    const keyNode = property?.type === "property" ? property.children?.[0] : undefined;
    if (keyNode) return { offset: keyNode.offset, length: keyNode.length };
  }

  for (let n = segments.length; n >= 0; n--) {
    const node = findNodeAtLocation(root, segments.slice(0, n));
    if (!node) continue;
    if (node === root) return { offset: root.offset, length: 1 }; // never underline everything
    // Highlight a property's key rather than its whole (possibly large) object value.
    const keyNode =
      node.parent?.type === "property" && node.type === "object"
        ? node.parent.children?.[0]
        : undefined;
    const target = keyNode ?? node;
    return { offset: target.offset, length: target.length };
  }
  return { offset: 0, length: 0 };
}

/** 1-based line and column of an offset. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}
