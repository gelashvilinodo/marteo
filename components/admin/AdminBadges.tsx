export const USER_STATUS_LABELS: Record<string, string> = { ACTIVE: "აქტიური", PENDING_VERIFICATION: "დასადასტურებელი", SUSPENDED: "შეჩერებული" };

const tones: Record<string, string> = {
    ACTIVE: "bg-success/12 text-success",
    PENDING_VERIFICATION: "bg-warning/12 text-warning",
    SUSPENDED: "bg-danger/12 text-danger",
};

export function UserStatusBadge({ status }: { status: string }) {
    return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[status] ?? "bg-background text-text-secondary"}`}>
        {USER_STATUS_LABELS[status] ?? status}
    </span>;
}

export const ROLE_LABELS: Record<string, string> = { OWNER: "მფლობელი", ADMIN: "ადმინი", MEMBER: "წევრი" };

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = { ACTIVE: "აქტიური", TRIALING: "საცდელი", CANCELED: "გაუქმებული", EXPIRED: "ვადაგასული", PAST_DUE: "გადაუხდელი" };
