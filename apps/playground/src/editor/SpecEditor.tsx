import { Component, lazy, Suspense, type ReactNode } from "react";
import { TextareaSpecEditor } from "./TextareaSpecEditor";
import type { SpecEditorProps } from "./types";

const MonacoSpecEditor = lazy(() => import("./MonacoSpecEditor"));

/** Falls back to the textarea if Monaco fails to load (e.g. blocked workers). */
class EditorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SpecEditor(props: SpecEditorProps) {
  const fallback = <TextareaSpecEditor {...props} />;
  return (
    <EditorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <MonacoSpecEditor {...props} />
      </Suspense>
    </EditorBoundary>
  );
}
