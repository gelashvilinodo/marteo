import pg from 'pg';
import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwxmbyweyvnekzzecroz.supabase.co';
const EXPIRED = `"createdAt" < (now() AT TIME ZONE 'UTC') - interval '24 hours'`;

// Runs from the Worker's hourly cron. Requests also purge on read, but without
// traffic expired messages would otherwise stay stored. Prisma DateTime columns
// are UTC "timestamp without time zone", hence the explicit UTC conversion.
// Photos leave storage first; rows whose photo could not be removed wait for
// the next run, so no file outlives its message.
/** @param {string} connectionString @param {string | undefined} storageKey */
export async function purgeExpiredSupportMessages(connectionString, storageKey) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const images = await client.query(`SELECT id, "imagePath" FROM "SupportMessage" WHERE ${EXPIRED} AND "imagePath" IS NOT NULL LIMIT 1000`);
        /** @type {string[]} */
        let kept = [];
        if (images.rows.length) {
            const storage = storageKey ? createClient(SUPABASE_URL, storageKey, {auth: {persistSession: false, autoRefreshToken: false}}).storage : null;
            const result = storage ? await storage.from('support-images').remove(images.rows.map(row => row.imagePath)) : {error: true};
            if (result.error) {
                console.error('Support image cleanup failed');
                kept = images.rows.map(row => row.id);
            }
        }
        const result = await client.query(`DELETE FROM "SupportMessage" WHERE ${EXPIRED} AND NOT (id = ANY($1::text[]))`, [kept]);
        return result.rowCount ?? 0;
    } finally {
        await client.end();
    }
}
