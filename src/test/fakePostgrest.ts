// A small stand-in for supabase-js's query builder, faithful to the parts of
// PostgREST that paging depends on:
//   - a response is capped at `maxRows` whatever `limit` asked for, and the
//     truncated page comes back WITHOUT an error — the behaviour that made the
//     recovery pull silently lossy;
//   - `count: 'exact'` reports the full filtered total, not the page size;
//   - with no `order`, rows come back in insertion order, as an unordered
//     Postgres scan of an append-mostly table does — the property the set
//     fetch in nexusRecovery.ts relies on;
//   - uuids order the way Postgres orders them (lowercase text order).
// Mirrors NCC's and StudyDesk's copies, plus `.in()`. Not a test file itself,
// and nothing in the app imports it, so it never reaches a bundle.

type Row = Record<string, unknown>;
type Filter = ['eq' | 'is', string, unknown] | ['in', string, readonly unknown[]];

export interface FakeRequest {
  table: string;
  columns?: string;
  filters: Filter[];
  order: { col: string; ascending: boolean } | null;
  limit: number | null;
  gt: [string, string] | null;
  count: string | null;
}

export interface FakeError {
  code: string;
  message: string;
}

export interface FakeOptions {
  maxRows?: number;
  withCount?: boolean;
  ignoreGt?: boolean;
  failWhen?: (req: FakeRequest, n: number) => FakeError | null;
}

interface FakeResult {
  data: Row[] | null;
  error: FakeError | null;
  count: number | null;
}

export interface FakeBuilder extends PromiseLike<FakeResult> {
  select(columns: string, options?: { count?: string }): FakeBuilder;
  eq(col: string, val: unknown): FakeBuilder;
  is(col: string, val: unknown): FakeBuilder;
  in(col: string, vals: readonly unknown[]): FakeBuilder;
  order(col: string, options?: { ascending?: boolean }): FakeBuilder;
  limit(n: number): FakeBuilder;
  gt(col: string, val: string): FakeBuilder;
}

export function makeUuids(n: number): string[] {
  return Array.from({ length: n }, () => crypto.randomUUID());
}

export function fakeClient(tables: Record<string, Row[]>, opts: FakeOptions = {}) {
  const { maxRows = 1000, withCount = true, ignoreGt = false, failWhen } = opts;
  const requests: FakeRequest[] = [];

  function from(table: string): FakeBuilder {
    const req: FakeRequest = { table, filters: [], order: null, limit: null, gt: null, count: null };
    const builder: FakeBuilder = {
      select(columns, o) {
        req.columns = columns;
        req.count = o?.count ?? null;
        return builder;
      },
      eq(col, val) {
        req.filters.push(['eq', col, val]);
        return builder;
      },
      is(col, val) {
        req.filters.push(['is', col, val]);
        return builder;
      },
      in(col, vals) {
        req.filters.push(['in', col, vals]);
        return builder;
      },
      order(col, o) {
        req.order = { col, ascending: o?.ascending !== false };
        return builder;
      },
      limit(n) {
        req.limit = n;
        return builder;
      },
      gt(col, val) {
        req.gt = [col, val];
        return builder;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => execute(req))
          .then(resolve, reject);
      },
    };
    return builder;
  }

  function matches(row: Row, f: Filter): boolean {
    if (f[0] === 'in') return f[2].includes(row[f[1]]);
    const [op, col, val] = f;
    // PostgREST `is.null` matches SQL NULL; an absent key reads as NULL too.
    if (op === 'is') return val === null ? row[col] == null : row[col] === val;
    return row[col] === val;
  }

  function execute(req: FakeRequest): FakeResult {
    requests.push(req);
    const failure = failWhen?.(req, requests.length);
    if (failure) return { data: null, error: failure, count: null };

    let rows = (tables[req.table] ?? []).filter((r) => req.filters.every((f) => matches(r, f)));
    const total = rows.length;
    if (req.gt && !ignoreGt) {
      const [col, val] = req.gt;
      rows = rows.filter((r) => String(r[col]) > val);
    }
    if (req.order) {
      const { col, ascending } = req.order;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    const take = Math.min(req.limit ?? Infinity, maxRows);
    return { data: rows.slice(0, take), error: null, count: req.count && withCount ? total : null };
  }

  return { from, requests };
}
