// v1.16 (limecore#28) — every row a query matches, not the first page.
//
// PostgREST caps a response at the project's max-rows setting (Supabase's
// default is 1000) and returns the truncated page WITHOUT an error. LimeLog's
// only pull is the recovery pull (`nexusRecovery.ts`), which rebuilds a user's
// history after a reinstall — so a truncated pull there quietly gave a heavy
// user back only part of their training, and sessions with no sets.
//
// Same semantics as NCC's and StudyDesk's copies (per-app on purpose: a shared
// package would break F-Droid's per-repo reproducible builds):
//
//   KEYSET, NOT OFFSET. Pages are `order('id').gt('id', last)`. Offset paging
//   skips an EXISTING row whenever one is inserted or deleted ahead of the
//   cursor mid-pull.
//
//   STOP ON THE COUNT, NOT ON A SHORT PAGE. "Stop when a page comes back
//   short" truncates again if the cap is ever set BELOW the page size. Page
//   one asks for `count: 'exact'`; the loop runs until it has that many rows.
//
//   ALL OR NOTHING. An error on any page returns that error and no rows.
//
// Keyset paging returns rows in uuid order, which is random. That is fine for
// sessions, but NOT for a session's sets, whose order is the order they were
// lifted — see `fetchSetsForSessions` in nexusRecovery.ts, which pages sets by
// session instead for exactly that reason.

export const PAGE_SIZE = 1000;

// 1,000,000 rows for one user in one table is not a real account; it is a
// server ignoring the keyset filter, which would otherwise loop forever.
const MAX_PAGES = 1000;

let warnedShortPage = false;

/** A PostgREST error, or one this helper raised itself. Structural, so both
 *  supabase-js's PostgrestError and a plain Error fit. */
export interface QueryError {
  message: string;
  code?: string;
}

interface Page<R> {
  data: R[] | null;
  error: QueryError | null;
  count?: number | null;
}

/** The slice of supabase-js's filter builder this helper and its callers use.
 *  Declared here rather than imported so the helper does not depend on the
 *  client's generics — the clients in these apps are not schema-typed. */
export interface PageQuery<R> extends PromiseLike<Page<R>> {
  eq(column: string, value: unknown): PageQuery<R>;
  is(column: string, value: null | boolean): PageQuery<R>;
  in(column: string, values: readonly unknown[]): PageQuery<R>;
  order(column: string, options?: { ascending?: boolean }): PageQuery<R>;
  limit(count: number): PageQuery<R>;
  gt(column: string, value: string): PageQuery<R>;
}

export interface QueryClient {
  from(table: string): { select(columns: string, options?: { count?: 'exact' }): unknown };
}

export interface SelectAllOptions<R> {
  columns?: string;
  /** Applied to every page, e.g. `(q) => q.eq('user_id', uid)`. */
  filter?: (q: PageQuery<R>) => PageQuery<R>;
  pageSize?: number;
}

export interface SelectAllResult<R> {
  data: R[] | null;
  error: QueryError | null;
}

export async function selectAll<R extends { id: string } = { id: string }>(
  client: QueryClient,
  table: string,
  { columns = '*', filter = (q) => q, pageSize = PAGE_SIZE }: SelectAllOptions<R> = {},
): Promise<SelectAllResult<R>> {
  const rows: R[] = [];
  let total: number | null = null;
  let lastId: string | null = null;

  for (let page = 0; ; page += 1) {
    if (page === MAX_PAGES) {
      // Never hand back a truncated list as if it were complete.
      return { data: null, error: new Error(`selectAll(${table}): gave up after ${MAX_PAGES} pages`) };
    }

    // The one cast in this file: supabase-js's builder satisfies `PageQuery`
    // structurally, but its declared return type is generic over a schema
    // these clients do not declare.
    const base = client
      .from(table)
      .select(columns, page === 0 ? { count: 'exact' } : undefined) as PageQuery<R>;
    let q = filter(base).order('id', { ascending: true }).limit(pageSize);
    if (lastId !== null) q = q.gt('id', lastId);

    const { data, error, count } = await q;
    if (error) return { data: null, error };
    if (page === 0) total = typeof count === 'number' ? count : null;

    const batch: R[] = data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;

    const nextId = String(batch[batch.length - 1].id);
    if (lastId !== null && !(nextId > lastId)) {
      return {
        data: null,
        error: new Error(`selectAll(${table}): the id cursor did not advance; refusing to loop`),
      };
    }
    lastId = nextId;

    if (total !== null) {
      if (rows.length >= total) break;
      if (batch.length < pageSize && !warnedShortPage) {
        warnedShortPage = true;
        console.warn(
          `selectAll(${table}): a page returned ${batch.length} of ${pageSize} rows with ` +
            `${total - rows.length} still to fetch — the API max-rows cap is below the page size. ` +
            'Paging continues, so nothing is lost, but the cap should be checked.',
        );
      }
    } else if (batch.length < pageSize) {
      // No count came back; the short-page rule is the best signal left.
      break;
    }
  }

  return { data: rows, error: null };
}

/** Test seam: the short-page warning fires once per session. */
export function resetSelectAllWarnings(): void {
  warnedShortPage = false;
}
