import type { EngineOptions, EyeVizEngine } from "@alumieye/eyeviz-core";
import type { ThreeRenderer, ThreeRendererOptions } from "@alumieye/eyeviz-renderer-three";
import type { EyeVizIssue } from "@alumieye/eyeviz-spec";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { useEyeViz } from "./use-eyeviz";
import { usePlayback } from "./use-playback";

/** Imperative actions on a rendered scene, via `ref`. */
export interface EyeVizSceneHandle {
  /** Frames all current content (or the spec's camera), e.g. after parameters moved things. */
  resetView(): void;
}

export interface EyeVizSceneProps extends ThreeRendererOptions {
  /** Gives access to `resetView()`. */
  readonly ref?: Ref<EyeVizSceneHandle>;
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
  /** Let users drag points that declare `drag` parameters. Default `true`. */
  readonly draggable?: boolean;
  /** `"all"` lets every point be dragged (for editors); pair it with `onDragPoint`. */
  readonly dragMode?: "declared" | "all";
  /**
   * Replaces the default drag behaviour (`engine.dragPoint`) — e.g. an editor that moves a
   * point with fixed coordinates by editing the spec.
   */
  readonly onDragPoint?: (id: string, target: readonly [number, number, number]) => void;
  readonly className?: string;
  /** Default size: full width with a 16 / 9 aspect ratio. */
  readonly style?: CSSProperties;
}

/** Retries of a failed renderer download, after these delays (ms). */
const RETRY_DELAYS = [1000, 3000, 9000];

const fallbackText: CSSProperties = {
  position: "absolute",
  inset: 0,
  margin: 0,
  padding: "1em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

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
 *
 * If the renderer cannot start — its download keeps failing (retried with backoff and when the
 * browser comes back online) or WebGL is unavailable — the scene's title and description are
 * shown as text instead, and the container gets `data-eyeviz-error="renderer"` for styling.
 */
export function EyeVizScene({ ref, ...props }: EyeVizSceneProps) {
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
  const engineRef = useRef(engine);
  const draggableRef = useRef(props.draggable ?? true);
  const onDragPointRef = useRef(props.onDragPoint);
  useEffect(() => {
    onSelectRef.current = props.onSelect;
    engineRef.current = engine;
    draggableRef.current = props.draggable ?? true;
    onDragPointRef.current = props.onDragPoint;
  });
  const [renderer, setRenderer] = useState<ThreeRenderer | null>(null);
  const [failed, setFailed] = useState(false);

  // Mount the renderer once per set of renderer options.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let instance: ThreeRenderer | undefined;
    let observer: IntersectionObserver | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let waitingForNetwork = false;

    const giveUp = (error: unknown) => {
      console.error("[EyeViz] The 3D renderer could not start; showing the scene as text.", error);
      setFailed(true);
    };
    // A download that failed while offline is retried when the browser is back online.
    const onOnline = () => {
      if (!waitingForNetwork) return;
      waitingForNetwork = false;
      attempt = 0;
      setFailed(false);
      start();
    };

    const start = () => {
      import("@alumieye/eyeviz-renderer-three").then(
        ({ ThreeRenderer }) => {
          if (cancelled) return;
          const options: ThreeRendererOptions = {
            ...(theme !== undefined ? { theme } : {}),
            ...(axes !== undefined ? { axes } : {}),
            ...(grid !== undefined ? { grid } : {}),
            ...(background !== undefined ? { background } : {}),
            ...(maxPixelRatio !== undefined ? { maxPixelRatio } : {}),
          };
          try {
            instance = createRenderer(ThreeRenderer, options);
          } catch (error) {
            // No WebGL (old device, disabled GPU): retrying will not help.
            return giveUp(error);
          }
          setFailed(false);
          setRenderer(instance);
        },
        (error: unknown) => {
          if (cancelled) return;
          const delay = RETRY_DELAYS[attempt++];
          if (delay !== undefined) {
            retry = setTimeout(start, delay);
            return;
          }
          waitingForNetwork = true;
          giveUp(error);
        },
      );
    };

    const createRenderer = (
      Renderer: typeof ThreeRenderer,
      options: ThreeRendererOptions,
    ): ThreeRenderer =>
      new Renderer(container, {
        ...options,
        onSelect: (id) => onSelectRef.current?.(id),
        onDrag: (id, target) => {
          if (!draggableRef.current) return;
          const custom = onDragPointRef.current;
          if (custom) return custom(id, target);
          const current = engineRef.current;
          if (current?.isDraggable(id)) current.dragPoint(id, target);
        },
      });

    window.addEventListener("online", onOnline);
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
      clearTimeout(retry);
      window.removeEventListener("online", onOnline);
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

  const dragMode = props.dragMode ?? "declared";
  useEffect(() => {
    renderer?.setDragMode(dragMode);
  }, [renderer, dragMode]);

  useImperativeHandle(ref, () => ({ resetView: () => renderer?.resetCamera() }), [renderer]);

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
      data-eyeviz-error={failed ? "renderer" : undefined}
      style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", ...style }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {metadata?.title || metadata?.description ? (
        <p style={failed ? fallbackText : visuallyHidden}>
          {metadata.title}
          {metadata.title && metadata.description ? ". " : ""}
          {metadata.description}
        </p>
      ) : null}
    </div>
  );
}
