import type { EyeVizEngine } from "@alumieye/eyeviz";
import { useEyeVizState } from "@alumieye/eyeviz/react";

/** Step-by-step navigation for scenes that declare `steps`. */
export function StepsBar({ engine }: { engine: EyeVizEngine }) {
  const step = useEyeVizState(engine, (state) => state.step) ?? null;
  const steps = engine.getSteps();
  if (steps.length === 0) return null;

  const current = step === null ? undefined : steps[step];
  const go = (index: number | null) => engine.setStep(index);

  return (
    <div className="steps" role="group" aria-label="Steps">
      <button
        type="button"
        aria-label="Previous step"
        disabled={step === null || step === 0}
        onClick={() => step !== null && go(step - 1)}
      >
        ‹
      </button>
      <div className="steps-text" aria-live="polite">
        <strong>
          {current
            ? `Step ${current.index + 1} of ${steps.length}${current.title ? `: ${current.title}` : ""}`
            : "Whole scene"}
        </strong>
        {current?.description ? <span className="muted"> — {current.description}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Next step"
        disabled={step === null || step === steps.length - 1}
        onClick={() => step !== null && go(step + 1)}
      >
        ›
      </button>
      <button
        type="button"
        aria-pressed={step === null}
        onClick={() => go(step === null ? 0 : null)}
      >
        {step === null ? "Back to steps" : "Whole scene"}
      </button>
    </div>
  );
}
