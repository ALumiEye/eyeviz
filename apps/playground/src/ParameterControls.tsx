import type { EyeVizEngine, NumberParameterModel } from "@alumieye/eyeviz";
import { useEyeVizState } from "@alumieye/eyeviz/react";

/** Controls generated from parameter definitions. The engine itself never renders UI. */
export function ParameterControls({ engine }: { engine: EyeVizEngine }) {
  const values = useEyeVizState(engine, (state) => state.parameters);
  const parameters = engine.getParameters().filter((p) => p.interactive);

  if (parameters.length === 0) {
    return <p className="muted">This scene has no interactive parameters.</p>;
  }

  return (
    <form className="controls" onSubmit={(event) => event.preventDefault()}>
      {parameters.map((parameter) => {
        const id = `param-${parameter.id}`;
        const label = parameter.label ?? parameter.id;
        const value = values?.[parameter.id];

        if (parameter.kind === "boolean") {
          return (
            <label key={parameter.id} className="control control-toggle" htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                role="switch"
                checked={value === true}
                onChange={(event) => engine.setParameter(parameter.id, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          );
        }

        const number = typeof value === "number" ? value : parameter.defaultValue;
        return (
          <div key={parameter.id} className="control">
            <label htmlFor={id}>
              <span>{label}</span>
              <output htmlFor={id}>{format(number, parameter)}</output>
            </label>
            <input
              id={id}
              type={isSlider(parameter) ? "range" : "number"}
              min={parameter.min}
              max={parameter.max}
              step={
                parameter.step ??
                (isSlider(parameter)
                  ? ((parameter.max as number) - (parameter.min as number)) / 200
                  : "any")
              }
              value={number}
              onChange={(event) => {
                const next = event.target.valueAsNumber;
                if (Number.isFinite(next)) engine.setParameter(parameter.id, next);
              }}
            />
          </div>
        );
      })}
    </form>
  );
}

function isSlider(p: NumberParameterModel): boolean {
  return p.control !== "input" && p.min !== undefined && p.max !== undefined;
}

function format(value: number, p: NumberParameterModel): string {
  const digits =
    p.step !== undefined && p.step < 1 ? Math.min(4, Math.ceil(-Math.log10(p.step))) : 0;
  const text = value.toFixed(p.step === undefined ? 2 : digits);
  return p.unit === "deg" ? `${text}°` : p.unit === "rad" ? `${text} rad` : text;
}
