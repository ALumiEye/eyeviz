import type { EngineOptions, EyeVizEngine } from "@alumieye/eyeviz-core";
import type { ThreeRenderer, ThreeRendererOptions } from "@alumieye/eyeviz-renderer-three";
import type { EyeVizIssue } from "@alumieye/eyeviz-spec";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useEyeViz } from "./use-eyeviz";
import { usePlayback } from "./use-playback";

export interface EyeVizSceneProps extends ThreeRendererOptions {
  /** A Scene Spec (untrusted input is fine). Ignored when `engine` is given. */
  readonly spec?: unknown;
  /** An existing engine, e.g. from `useEyeViz`, to control parameters from outside. */
  readonly engine?: EyeVizEngine | null;
  readonly engineOptions?: EngineOptions;
  /**
   * Load Three.js and create the WebGL context only when the scene approaches the viewport.
   * Default `true`.
   */
  readonly lazy?: boolean;
  /**
   * Start playing when shown. Defaults to the spec's `timeline.autoplay`; never under reduced
   * motion. Only applies when the component owns the engine (`spec` prop); with `engine`, use
   * `usePlayback` yourself.
   */
  readonly autoplay?: boolean;
  /** Called with validation issues whenever `spec` changes. */
  readonly onIssues?: (issues: readonly EyeVizIssue[]) => void;
  /** The selected object's ID (emphasized in the scene), or `null`. */
  readonly selected?: string | null;
  /** Called when the user clicks or taps an object (its ID) or empty space (`null`). */
  readonly onSelect?: (id: string | null) => void;
  readonly className?: string;
  /** Default size: full width with a 16 / 9 aspect ratio. */
  readonly style?: CSSProperties;
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Renders an EyeViz scene.
 *
 * ```tsx
 * <EyeVizScene spec={scene} />
 * ```
 *
 * Server-side rendering outputs only the container and the scene's title/description as text;
 * Three.js runs exclusively in the browser. If the spec becomes invalid, the last valid scene
 * stays on screen.
 */
export function EyeVizScene(props: EyeVizSceneProps) {
  const {
    spec,
    engine: externalEngine,
    engineOptions,
    lazy = true,
    onIssues,
    className,
    style,
  } = props;
  const { theme, axes, grid, background, maxPixelRatio, autoplay } = props;

  const own = useEyeViz(externalEngine === undefined ? spec : null, engineOptions);
  const engine = externalEngine === undefined ? own.engine : externalEngine;
  const issues = externalEngine === undefined ? own.issues : undefined;
  usePlayback(
    externalEngine === undefined ? own.engine : null,
    autoplay !== undefined ? { autoplay } : {},
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // Latest callback without recreating the renderer (and its WebGL context) when it changes.
  const onSelectRef = useRef(props.onSelect);
  useEffect(() => {
    onSelectRef.current = props.onSelect;
  });
  const [renderer, setRenderer] = useState<ThreeRenderer | null>(null);

  // Mount the renderer once per set of renderer options.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let instance: ThreeRenderer | undefined;
    let observer: IntersectionObserver | undefined;

    const start = () => {
      void import("@alumieye/eyeviz-renderer-three").then(({ ThreeRenderer }) => {
        if (cancelled) return;
        const options: ThreeRendererOptions = {
          ...(theme !== undefined ? { theme } : {}),
          ...(axes !== undefined ? { axes } : {}),
          ...(grid !== undefined ? { grid } : {}),
          ...(background !== undefined ? { background } : {}),
          ...(maxPixelRatio !== undefined ? { maxPixelRatio } : {}),
        };
        instance = new ThreeRenderer(container, {
          ...options,
          onSelect: (id) => onSelectRef.current?.(id),
        });
        setRenderer(instance);
      });
    };

    if (lazy && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            start();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(container);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.dispose();
      setRenderer(null);
    };
  }, [lazy, theme, axes, grid, background, maxPixelRatio]);

  // Connect the current engine. A new engine replaces the model without a new WebGL context.
  useEffect(() => {
    if (!renderer || !engine) return;
    renderer.setModel(engine.model, engine.getState());
    return engine.subscribe((state, changed) => renderer.update(state, changed));
  }, [renderer, engine]);

  const selected = props.selected ?? null;
  useEffect(() => {
    renderer?.setSelection(selected);
  }, [renderer, selected]);

  useEffect(() => {
    if (issues) onIssues?.(issues);
  }, [issues, onIssues]);

  const metadata = engine?.model.metadata;
  const label =
    [metadata?.title, metadata?.description].filter(Boolean).join(". ") || "EyeViz scene";

  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      lang={metadata?.lang}
      style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", ...style }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {metadata?.title || metadata?.description ? (
        <p style={visuallyHidden}>
          {metadata.title}
          {metadata.title && metadata.description ? ". " : ""}
          {metadata.description}
        </p>
      ) : null}
    </div>
  );
}
