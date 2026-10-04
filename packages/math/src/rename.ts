const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Renames every use of the variable `from` in an expression to `to`, leaving everything else
 * (spacing, other names, numbers such as `1e5`) untouched. Works on invalid expressions too,
 * so an editor can rename while the user is mid-edit.
 */
export function renameSymbol(source: string, from: string, to: string): string {
  if (!IDENTIFIER.test(from) || !IDENTIFIER.test(to) || from === to) return source;
  // An identifier occurrence is not preceded or followed by identifier characters (this also
  // skips the exponent in `1e5`, which is preceded by a digit).
  const pattern = new RegExp(`(?<![A-Za-z0-9_.])${from}(?![A-Za-z0-9_])`, "g");
  return source.replace(pattern, to);
}
