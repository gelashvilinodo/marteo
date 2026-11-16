import "server-only";
import type { Metadata } from "next";
import { getAdminCandidate } from "./authorization";

/**
 * Admin page titles reach only the admin. A static `metadata` export is sent in the RSC payload even when the
 * layout answers 404, which would tell anyone that an admin panel lives at that address.
 */
export async function adminMetadata(title: string, extra: Metadata = {}): Promise<Metadata> {
    return await getAdminCandidate() ? { ...extra, title } : {};
}
