/**
 * Pretty-prints JSON like `JSON.stringify(value, null, 2)`, but keeps short arrays of
 * primitives on one line, so vectors read as `[0, -9, 7]` instead of five lines.
 */
export function formatJson(value: unknown, indent = ""): string {
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inline = value.every((item) => item === null || typeof item !== "object");
    if (inline) {
      const line = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
      if (line.length <= 80) return line;
    }
    return `[\n${value.map((item) => next + formatJson(item, next)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([key, item]) => `${next}${JSON.stringify(key)}: ${formatJson(item, next)}`)
      .join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}
