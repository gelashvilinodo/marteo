const STORAGE_ORIGIN = "https://uwxmbyweyvnekzzecroz.supabase.co";

// Only server-generated public image paths belonging to this account/business.
export function isOwnedStorageImage(value: string, bucket: "product-images" | "business-logos", ownerId: string): boolean {
    if (!ownerId || !/^[A-Za-z0-9_-]+$/.test(ownerId)) return false;
    try {
        const url = new URL(value);
        if (url.origin !== STORAGE_ORIGIN || url.username || url.password || url.search || url.hash) return false;
        const prefix = `${STORAGE_ORIGIN}/storage/v1/object/public/${bucket}/${ownerId}/`;
        if (!value.startsWith(prefix)) return false;
        const filename = value.slice(prefix.length);
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.full)?\.(png|jpg|webp)$/.test(filename);
    } catch { return false; }
}
