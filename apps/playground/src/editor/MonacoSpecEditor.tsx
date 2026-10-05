import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type * as MonacoApi from "monaco-editor";
import * as monaco from "./monaco-lean.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import { useEffect, useRef, useState } from "react";
import type { SpecEditorProps } from "./types";

// Bundle a lean Monaco locally (no CDN): the playground must work offline and on static
// hosting, and only needs the JSON language.
self.MonacoEnvironment = {
  getWorker: (_workerId, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco: monaco as unknown as typeof MonacoApi });

const SCHEMA_URI = "inmemory://eyeviz/scene-spec-0.1.schema.json";
const MARKER_OWNER = "eyeviz";

function useColorScheme(): "vs" | "vs-dark" {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const onChange = () => setDark(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return dark ? "vs-dark" : "vs";
}

/** Monaco with schema-aware autocomplete and EyeViz issues as inline markers. */
export default function MonacoSpecEditor({
  value,
  onChange,
  issues,
  jsonSchema,
  reveal,
}: SpecEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [ready, setReady] = useState(false);
  const theme = useColorScheme();

  useEffect(() => {
    monaco.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      enableSchemaRequest: false,
      // Structural problems are reported by EyeViz itself (single source of truth, better
      // messages); the schema still powers autocomplete and hovers.
      schemaValidation: "ignore",
      schemas: [{ uri: SCHEMA_URI, fileMatch: ["*"], schema: jsonSchema }],
    });
  }, [jsonSchema]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!ready || !model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      issues.map((issue) => {
        const start = model.getPositionAt(issue.range.offset);
        const end = model.getPositionAt(issue.range.offset + Math.max(issue.range.length, 1));
        return {
          severity: monaco.MarkerSeverity.Error,
          message: issue.message,
          source: issue.code,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        };
      }),
    );
  }, [issues, ready, value]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!reveal || !editor || !model) return;
    const start = model.getPositionAt(reveal.range.offset);
    const end = model.getPositionAt(reveal.range.offset + reveal.range.length);
    editor.setSelection(
      new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
    );
    editor.revealRangeInCenter(
      new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
    );
    editor.focus();
  }, [reveal]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    setReady(true);
  };

  return (
    <Editor
      language="json"
      path="scene.json"
      theme={theme}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        formatOnPaste: true,
        ariaLabel: "Scene Specification (JSON)",
      }}
    />
  );
}
