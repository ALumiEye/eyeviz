import type { SceneSpec } from "@alumieye/eyeviz-spec";
import { applyCommand, type EditCommand, type EditResult } from "./commands";

export interface DocumentOptions {
  /** Maximum undo steps kept. Default 200. */
  readonly historyLimit?: number;
  /** Edits with the same coalescing key within this many ms merge into one undo step. Default 1000. */
  readonly coalesceMs?: number;
  /** Clock in milliseconds (injectable for tests). Default `Date.now`. */
  readonly now?: () => number;
}

export interface ApplyOptions {
  /**
   * Consecutive edits with the same key (e.g. `"drag:P"` or `"edit:A.position"`) within the
   * coalescing window become a single undo step — dragging or typing undoes in one go.
   */
  readonly coalesceKey?: string;
}

export interface DocumentChange {
  readonly spec: SceneSpec;
  readonly summary: string;
  readonly source: "edit" | "replace" | "undo" | "redo";
}

export type DocumentListener = (change: DocumentChange) => void;

interface Entry {
  readonly spec: SceneSpec;
  readonly summary: string;
  readonly key?: string;
  readonly time: number;
}

/**
 * A Scene Spec being edited: applies commands, keeps undo/redo history, notifies listeners.
 * Specs are immutable values, so history is just a list of previous specs.
 */
export class SceneDocument {
  readonly #listeners = new Set<DocumentListener>();
  readonly #limit: number;
  readonly #coalesceMs: number;
  readonly #now: () => number;
  #spec: SceneSpec;
  #past: Entry[] = [];
  #future: Entry[] = [];

  constructor(spec: SceneSpec, options: DocumentOptions = {}) {
    this.#spec = spec;
    this.#limit = options.historyLimit ?? 200;
    this.#coalesceMs = options.coalesceMs ?? 1000;
    this.#now = options.now ?? Date.now;
  }

  get spec(): SceneSpec {
    return this.#spec;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Summary of the edit that `undo()` would revert. */
  get undoSummary(): string | undefined {
    return this.#past.at(-1)?.summary;
  }

  /** Summary of the edit that `redo()` would re-apply. */
  get redoSummary(): string | undefined {
    return this.#future.at(-1)?.summary;
  }

  /** Applies a command. On failure, nothing changes and the error is returned. */
  apply(command: EditCommand, options: ApplyOptions = {}): EditResult {
    const result = applyCommand(this.#spec, command);
    if (result.ok) this.#commit(result.spec, result.summary, options.coalesceKey);
    return result;
  }

  /** Replaces the whole spec (e.g. after editing the JSON directly), as one undoable step. */
  replace(spec: SceneSpec, summary = "Edit JSON", options: ApplyOptions = {}): void {
    if (spec === this.#spec) return;
    this.#commit(spec, summary, options.coalesceKey, "replace");
  }

  undo(): boolean {
    const entry = this.#past.pop();
    if (!entry) return false;
    this.#future.push({ spec: this.#spec, summary: entry.summary, time: this.#now() });
    this.#spec = entry.spec;
    this.#notify(entry.summary, "undo");
    return true;
  }

  redo(): boolean {
    const entry = this.#future.pop();
    if (!entry) return false;
    this.#past.push({ spec: this.#spec, summary: entry.summary, time: this.#now() });
    this.#spec = entry.spec;
    this.#notify(entry.summary, "redo");
    return true;
  }

  subscribe(listener: DocumentListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #commit(
    spec: SceneSpec,
    summary: string,
    key: string | undefined,
    source: DocumentChange["source"] = "edit",
  ) {
    const now = this.#now();
    const last = this.#past.at(-1);
    const coalesce = key !== undefined && last?.key === key && now - last.time <= this.#coalesceMs;
    if (coalesce) {
      // Keep the spec from before the first edit of the burst; refresh the burst's timestamp.
      this.#past[this.#past.length - 1] = { ...last, time: now };
    } else {
      this.#past.push({
        spec: this.#spec,
        summary,
        ...(key !== undefined ? { key } : {}),
        time: now,
      });
      if (this.#past.length > this.#limit) this.#past.shift();
    }
    this.#future = [];
    this.#spec = spec;
    this.#notify(summary, source);
  }

  #notify(summary: string, source: DocumentChange["source"]): void {
    const change: DocumentChange = { spec: this.#spec, summary, source };
    for (const listener of [...this.#listeners]) listener(change);
  }
}
