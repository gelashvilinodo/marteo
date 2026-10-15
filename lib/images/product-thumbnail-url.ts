export function productThumbnailUrl(original: string): string {
    try {
        const url = new URL(original);
        if (url.protocol !== "https:" || url.hostname !== "uwxmbyweyvnekzzecroz.supabase.co") return original;
        const pattern = /^(\/storage\/v1\/object\/public\/product-images\/[a-zA-Z0-9_-]+\/[0-9a-f-]{36})\.full\.(png|jpg|webp)$/;
        if (!pattern.test(url.pathname)) return original;
        url.pathname = url.pathname.replace(pattern, "$1.thumb");
        return url.toString();
    } catch { return original; }
}
