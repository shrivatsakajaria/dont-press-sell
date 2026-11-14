// Safe localStorage wrapper. Every key is prefixed `dps:` here, so callers pass bare names.
// Nothing in this file ever throws: storage may be missing, blocked or full.
const PREFIX = 'dps:';

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const s = storage();
    if (!s) return fallback;
    const raw = s.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * A value kept in memory for the visit and written through to storage. When
 * storage is blocked the value still accumulates until the page closes.
 */
export interface Cell<T> {
  get(): T;
  set(v: T): void;
}

const cells: { reset(): void }[] = [];

export function cell<T>(key: string, fallback: T): Cell<T> {
  let mem: { v: T } | null = null;
  const c = {
    get(): T {
      if (!mem) mem = { v: load(key, fallback) };
      return mem.v;
    },
    set(v: T): void {
      mem = { v };
      save(key, v);
    },
    reset(): void {
      mem = null;
    },
  };
  cells.push(c);
  return c;
}

/** Test helper: forgets every in-memory copy so the next read goes to storage again. */
export function resetCells(): void {
  for (const c of cells) c.reset();
}
