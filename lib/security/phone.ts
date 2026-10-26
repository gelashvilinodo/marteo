// One canonical representation for registration, profile changes and delivery.
export function normalizePhone(value: string): string {
    const compact = value.trim().replace(/[\s()\-]/g, "").replace(/^00/, "+");
    return /^5\d{8}$/.test(compact) ? `+995${compact}` : compact;
}
export function isAllowedSmsPhone(phone: string): boolean {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return false;
    const prefixes = (process.env.SMS_ALLOWED_COUNTRY_CODES ?? "995").split(",").map(v=>v.trim()).filter(v=>/^\d{1,3}$/.test(v));
    if (!prefixes.some(prefix=>phone.startsWith(`+${prefix}`))) return false;
    return !phone.startsWith("+995") || /^\+9955\d{8}$/.test(phone);
}
