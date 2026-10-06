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

/**
 * Coordinates as Vietnamese textbooks write them: `(1,25; −0,5)` — decimal comma, semicolon
 * between the coordinates. Trailing zeros are dropped.
 */
export function vietnameseCoordinates(position: readonly number[], decimals: number): string {
  const number = (value: number) => {
    let text = value.toFixed(decimals);
    if (text.includes(".")) text = text.replace(/\.?0+$/, "");
    if (text === "-0") text = "0";
    return text.replace("-", "−").replace(".", ",");
  };
  return `(${number(position[0] ?? 0)}; ${number(position[1] ?? 0)})`;
}
