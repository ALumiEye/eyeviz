import { useEffect, useRef } from "react";
import type { SpecEditorProps } from "./types";

/** Minimal editor used while Monaco loads. Keeps the playground usable immediately. */
export function TextareaSpecEditor({ value, onChange, reveal }: SpecEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!reveal || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(reveal.range.offset, reveal.range.offset + reveal.range.length);
  }, [reveal]);
  return (
    <textarea
      ref={ref}
      className="textarea-editor"
      aria-label="Scene Specification (JSON)"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
