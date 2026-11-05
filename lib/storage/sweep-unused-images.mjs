import pg from 'pg';
import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwxmbyweyvnekzzecroz.supabase.co';
const BUCKETS = ['product-images', 'business-logos', 'user-avatars'];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// A fresh upload may still sit in an unsaved form or import draft.
const GRACE = `interval '7 days'`;

// Every UUID written anywhere in the app's tables, JSON snapshots included
// (orders, audit log, AI chats, import drafts). A file whose UUID appears
// nowhere is unused. Scanning all text columns, not a fixed list, means a
// new table that stores photo URLs cannot get its photos deleted by mistake.
/** @param {pg.Client} client */
async function referencedUuids(client) {
    const columns = await client.query(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')
    `);
    /** @type {Set<string>} */
    const found = new Set();
    for (const {table_name: table, column_name: column} of columns.rows) {
        const ref = `"${table.replaceAll('"', '""')}"."${column.replaceAll('"', '""')}"`;
        const result = await client.query(`
            SELECT DISTINCT match[1] AS uuid
            FROM "${table.replaceAll('"', '""')}", regexp_matches(${ref}::text, '(${UUID})', 'g') AS match
            WHERE ${ref}::text ~ '${UUID}'
        `);
        for (const row of result.rows) found.add(row.uuid);
    }
    return found;
}

// Files older than the grace period whose UUID nothing in the database mentions.
/** @param {string} connectionString */
export async function findUnusedImages(connectionString) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const objects = await client.query(`
            SELECT bucket_id AS bucket, name, created_at AS "createdAt", (metadata->>'size')::bigint AS size
            FROM storage.objects
            WHERE bucket_id = ANY($1::text[]) AND created_at < now() - ${GRACE}
            ORDER BY bucket_id, name
        `, [BUCKETS]);
        const referenced = await referencedUuids(client);
        if (referenced.size === 0) throw new Error('No references found');
        // "<owner>/<uuid>.jpg", or a product photo pair "<uuid>.full.jpg" + "<uuid>.thumb".
        const pattern = new RegExp(`^[A-Za-z0-9_-]{1,100}/(${UUID})(\\.full)?\\.(png|jpg|webp|thumb)$`);
        return objects.rows.filter(object => {
            const match = pattern.exec(object.name);
            // Unknown file names are left alone.
            return match !== null && !referenced.has(match[1]);
        });
    } finally {
        await client.end();
    }
}

/**
 * @param {string} connectionString
 * @param {string | undefined} storageKey
 */
export async function sweepUnusedImages(connectionString, storageKey) {
    if (!storageKey) throw new Error('SUPABASE_SECRET_KEY is not configured');
    const unused = await findUnusedImages(connectionString);
    const storage = createClient(SUPABASE_URL, storageKey, {auth: {persistSession: false, autoRefreshToken: false}}).storage;
    let removed = 0;
    for (const bucket of BUCKETS) {
        const names = unused.filter(object => object.bucket === bucket).map(object => object.name);
        for (let start = 0; start < names.length; start += 500) {
            const {data, error} = await storage.from(bucket).remove(names.slice(start, start + 500));
            if (error) throw new Error(`Unused image cleanup failed in ${bucket}`);
            removed += data?.length ?? 0;
        }
    }
    return removed;
}
