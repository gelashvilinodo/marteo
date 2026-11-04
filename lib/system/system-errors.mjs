import pg from 'pg';
import {createHash} from 'node:crypto';

// Shared by the Next server (instrumentation) and the Worker's cron, so it stays plain JS.
// Only developer-written text reaches the table: an Error contributes its type
// (TypeError, P2002), never its message, which may quote customer data.

const MAX_MESSAGE = 300;

/** @param {unknown} value */
function describeValue(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Error) {
        const code = /** @type {{code?: unknown}} */ (value).code;
        return typeof code === 'string' && /^[A-Z0-9_]{2,20}$/.test(code) ? `${value.name} ${code}` : value.name;
    }
    return '';
}

/** @param {unknown[]} args */
export function describeArgs(args) {
    return args.map(describeValue).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
}

// Ids, long numbers and hashes vary per request; grouping ignores them.
/** @param {string} text */
function normalize(text) {
    return text.replace(/\b[a-z0-9_-]{20,}\b/gi, '*').replace(/\d{4,}/g, '#');
}

/** @param {string} source @param {string} message @param {string | null} route */
export function errorFingerprint(source, message, route) {
    return createHash('sha256').update(`${source}|${route ?? ''}|${normalize(message)}`).digest('hex');
}

/**
 * Adds one occurrence. A resolved group that happens again is reopened.
 * Prisma DateTime columns are UTC "timestamp without time zone", hence the explicit UTC conversion.
 * @param {pg.Client | pg.PoolClient} client
 * @param {{source: string, message: string, route?: string | null}} error
 */
export async function insertSystemError(client, {source, message, route = null}) {
    const text = message.slice(0, MAX_MESSAGE) || 'Unknown error';
    await client.query(`
        INSERT INTO "SystemError" (id, fingerprint, source, message, route, "firstAt", "lastAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')
        ON CONFLICT (fingerprint) DO UPDATE SET count = "SystemError".count + 1, "lastAt" = now() AT TIME ZONE 'UTC', "resolvedAt" = NULL
    `, [errorFingerprint(source, text, route), source, text, route]);
}

/** @param {string} connectionString @param {{source: string, message: string, route?: string | null}} error */
export async function recordSystemError(connectionString, error) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        await insertSystemError(client, error);
    } finally {
        await client.end();
    }
}
