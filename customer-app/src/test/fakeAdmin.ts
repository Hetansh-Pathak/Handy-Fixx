import type { AdminClient, DbError, Query, Result, Row } from "../../../database/supabase/functions/delete-customer-account/core";

type Filter = { kind: "eq" | "ilike"; col: string; val: string };
type Op = "select" | "update" | "delete";

/** In-memory stand-in for the Supabase service-role client, with failure injection. */
export class FakeAdmin {
  tables: Record<string, Row[]>;
  files: Record<string, string[]>; // bucket -> object paths
  authUsers: Set<string>;
  log: string[] = [];
  missingTables = new Set<string>();
  failures: Record<string, DbError> = {}; // "table.op" -> error
  authError: DbError | null = null;

  constructor(seed: { tables?: Record<string, Row[]>; files?: Record<string, string[]>; users?: string[] }) {
    this.tables = structuredClone(seed.tables ?? {});
    this.files = structuredClone(seed.files ?? {});
    this.authUsers = new Set(seed.users ?? []);
  }

  private matches(row: Row, filters: Filter[]) {
    return filters.every((f) => {
      const v = row[f.col];
      return f.kind === "eq" ? v === f.val : String(v ?? "").toLowerCase() === f.val.toLowerCase();
    });
  }

  private run(table: string, op: Op, filters: Filter[], patch?: Row): Result {
    this.log.push(`${table}.${op}`);
    if (this.missingTables.has(table)) return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } };
    const fail = this.failures[`${table}.${op}`];
    if (fail) return { data: null, error: fail };
    const rows = (this.tables[table] ??= []);
    const hit = rows.filter((r) => this.matches(r, filters));
    if (op === "select") return { data: hit.map((r) => ({ ...r })), error: null };
    if (op === "update") { hit.forEach((r) => Object.assign(r, patch)); return { data: null, error: null }; }
    this.tables[table] = rows.filter((r) => !hit.includes(r));
    return { data: null, error: null };
  }

  private query(table: string, op: Op, patch?: Row): Query {
    const filters: Filter[] = [];
    const q: Query = {
      eq: (col, val) => { filters.push({ kind: "eq", col, val }); return q; },
      ilike: (col, val) => { filters.push({ kind: "ilike", col, val }); return q; },
      then: (onF, onR) => Promise.resolve(this.run(table, op, filters, patch)).then(onF, onR),
    };
    return q;
  }

  client(): AdminClient {
    return {
      from: (table) => ({
        select: () => this.query(table, "select"),
        update: (patch) => this.query(table, "update", patch),
        delete: () => this.query(table, "delete"),
      }),
      storage: {
        from: (bucket) => ({
          list: async (path) => {
            this.log.push(`storage.list:${path}`);
            const prefix = path.replace(/\/?$/, "/");
            const seen = new Map<string, boolean>(); // name -> isFolder
            for (const p of this.files[bucket] ?? []) {
              if (!p.startsWith(prefix)) continue;
              const rest = p.slice(prefix.length);
              const [head, ...tail] = rest.split("/");
              seen.set(head, tail.length > 0);
            }
            return { data: [...seen].map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` })), error: null };
          },
          remove: async (paths) => {
            this.log.push(`storage.remove:${paths.length}`);
            this.files[bucket] = (this.files[bucket] ?? []).filter((p) => !paths.includes(p));
            return { error: null };
          },
        }),
      },
      auth: {
        admin: {
          deleteUser: async (id) => {
            this.log.push("auth.deleteUser");
            if (this.authError) return { error: this.authError };
            this.authUsers.delete(id);
            return { error: null };
          },
        },
      },
    };
  }
}
