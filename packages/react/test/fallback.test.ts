// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const spec = {
  version: "0.1",
  metadata: { title: "Unit circle", description: "A point moving on a circle." },
  objects: [{ id: "P", type: "point", position: [1, 0, 0] }],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render() {
  const { EyeVizScene } = await import("../src/index");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(EyeVizScene, { spec, lazy: false })));
  const container = host.firstElementChild as HTMLElement;
  return { container, root };
}

/** Lets pending promises (the dynamic import) settle inside `act`. */
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)));

afterEach(() => {
  vi.doUnmock("@alumieye/eyeviz-renderer-three");
  vi.resetModules();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("when the renderer cannot start", () => {
  it("shows the scene as text if WebGL is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@alumieye/eyeviz-renderer-three", () => ({
      ThreeRenderer: class {
        constructor() {
          throw new Error("WebGL is not available");
        }
      },
    }));
    const { container, root } = await render();
    await settle();
    expect(container.dataset.eyevizError).toBe("renderer");
    expect(container.querySelector("p")?.style.position).toBe("absolute");
    expect(container.querySelector("p")?.style.width).toBe("");
    expect(container.textContent).toContain("A point moving on a circle.");
    expect(console.error).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("retries a failed download, then shows text, then recovers when back online", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let downloads = 0;
    let online = false;
    const renderers: unknown[] = [];
    vi.doMock("@alumieye/eyeviz-renderer-three", () => {
      downloads++;
      if (!online) throw new Error("Failed to fetch dynamically imported module");
      return {
        ThreeRenderer: class {
          constructor() {
            renderers.push(this);
          }
          setModel() {}
          setDragMode() {}
          setSelection() {}
          update() {}
          dispose() {}
        },
      };
    });
    vi.useFakeTimers();
    const { container, root } = await render();
    for (const delay of [0, 1000, 3000, 9000]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
      vi.resetModules();
    }
    expect(downloads).toBe(4);
    expect(container.dataset.eyevizError).toBe("renderer");

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(renderers).toHaveLength(1);
    expect(container.dataset.eyevizError).toBeUndefined();
    root.unmount();
  });

  it("does not retry after unmounting", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let downloads = 0;
    vi.doMock("@alumieye/eyeviz-renderer-three", () => {
      downloads++;
      throw new Error("offline");
    });
    vi.useFakeTimers();
    const { root } = await render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(downloads).toBe(1);
    act(() => root.unmount());
    vi.resetModules();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(downloads).toBe(1);
    expect(error).not.toHaveBeenCalled();
  });
});
