import "server-only";
import { Pool, types } from "pg";
import { sql, type Sql } from "@prisma/client-runtime-utils";
import { getConnectionString } from "./connection-string";

export function createPgReader() {
    const pool = new Pool({
        connectionString: getConnectionString(), max: 1,
        connectionTimeoutMillis: 10000, query_timeout: 15000,
        types: {
            getTypeParser(oid, format) {
                // Prisma DateTime uses UTC timestamp without time zone.
                if (oid === 1114 && format !== "binary") {
                    return (value: string) => new Date(`${value.replace(" ", "T")}Z`);
                }
                return types.getTypeParser(oid, format);
            },
        },
    });
    pool.on("error", () => console.error("Order reader connection error"));
    type QueryReader = { $queryRaw<T = unknown>(query: TemplateStringsArray | Sql, ...values: unknown[]): Promise<T> };
    return {
        async withReadTransaction<T>(read: (client: QueryReader) => Promise<T>): Promise<T> {
            const connection = await pool.connect();
            // A transaction owns one connection. Serialize reads even if a caller
            // uses Promise.all; pg must not receive overlapping client.query calls.
            let pending: Promise<unknown> = Promise.resolve();
            let queryFailed = false;
            let queryError: unknown;
            try {
                await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
                const result = await read({
                    async $queryRaw<R = unknown>(query: TemplateStringsArray | Sql, ...values: unknown[]): Promise<R> {
                        const statement = Array.isArray(query) ? sql(query as TemplateStringsArray, ...values) : query as Sql;
                        const result = pending.then(async () => {
                            if (queryFailed) throw queryError;
                            return (await connection.query(statement.text, statement.values)).rows as R;
                        });
                        pending = result.catch(error => {
                            queryFailed = true;
                            queryError = error;
                        });
                        return result;
                    },
                });
                await pending;
                if (queryFailed) throw queryError;
                await connection.query("COMMIT");
                return result;
            } catch (error) {
                await pending;
                try { await connection.query("ROLLBACK"); } catch { /* Preserve the original error. */ }
                throw error;
            } finally { connection.release(); }
        },
        async $queryRaw<T = unknown>(query: TemplateStringsArray | Sql, ...values: unknown[]): Promise<T> {
            const statement = Array.isArray(query) ? sql(query as TemplateStringsArray, ...values) : query as Sql;
            const result = await pool.query(statement.text, statement.values);
            return result.rows as T;
        },
        async $disconnect() { await pool.end(); },
    };
}
