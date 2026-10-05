import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";

interface Props {
  /** LaTeX. */
  readonly value: string;
  readonly onChange: (latex: string) => void;
  /** Enter. */
  readonly onSubmit: () => void;
  /** Called once if the editor cannot load (offline…); the caller falls back to text. */
  readonly onUnavailable: () => void;
  readonly label: string;
  /** Decimal separator typed with the "," key: "," in Vietnamese, "." in English. */
  readonly decimalSeparator: "," | ".";
  readonly className?: string;
  readonly describedBy?: string;
  readonly invalid?: boolean;
}

/**
 * A formula field: √, powers and fractions are typed and shown as in a textbook (MathLive),
 * with a virtual math keyboard on touch devices. Reports LaTeX.
 */
export function MathInput(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("./mathlive-setup").then(
      ({ MathfieldElement }) => {
        const container = host.current;
        if (cancelled || !container) return;
        try {
          MathfieldElement.decimalSeparator = latest.current.decimalSeparator;
          const mf = new MathfieldElement();
          mf.smartFence = true;
          mf.mathVirtualKeyboardPolicy = "auto";
          mf.value = latest.current.value;
          mf.addEventListener("input", () => latest.current.onChange(mf.value));
          mf.addEventListener(
            "keydown",
            (event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              latest.current.onSubmit();
            },
            { capture: true },
          );
          container.replaceChildren(mf);
          // After mounting (MathLive requires it): its menu offers matrices, colours and text
          // modes that formulas cannot use, and its button does not close the menu on a
          // second click — leave it out.
          mf.menuItems = [];
          field.current = mf;
          setReady(true);
        } catch (error) {
          console.error("[EyeViz] The formula editor could not start.", error);
          container.replaceChildren();
          latest.current.onUnavailable();
        }
      },
      () => {
        if (!cancelled) latest.current.onUnavailable();
      },
    );
    return () => {
      cancelled = true;
      field.current?.remove();
      field.current = null;
    };
  }, []);

  // Outside changes (e.g. cleared after drawing) flow into the field.
  useEffect(() => {
    const mf = field.current;
    if (mf && mf.value !== props.value) mf.value = props.value;
  }, [props.value, ready]);

  useEffect(() => {
    const mf = field.current;
    if (!mf) return;
    mf.setAttribute("aria-label", props.label);
    if (props.describedBy) mf.setAttribute("aria-describedby", props.describedBy);
    mf.setAttribute("aria-invalid", String(Boolean(props.invalid)));
  }, [props.label, props.describedBy, props.invalid, ready]);

  return (
    <div
      ref={host}
      className={props.className}
      data-ready={ready || undefined}
      aria-busy={!ready || undefined}
    />
  );
}
