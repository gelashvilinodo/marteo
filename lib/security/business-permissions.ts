// Until individual team permissions are introduced, business-data writes are
// limited to the same roles that already manage purchases and production.
export function canManageBusinessData(role: string | null | undefined): boolean {
    return role === "OWNER" || role === "ADMIN";
}
