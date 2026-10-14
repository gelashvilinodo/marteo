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
    return {
        async $queryRaw<T = unknown>(query: TemplateStringsArray | Sql, ...values: unknown[]): Promise<T> {
            const statement = Array.isArray(query) ? sql(query as TemplateStringsArray, ...values) : query as Sql;
            const result = await pool.query(statement.text, statement.values);
            return result.rows as T;
        },
        async $disconnect() { await pool.end(); },
    };
}
