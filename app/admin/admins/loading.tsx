import { AdminSkeleton, SkHeader, SkPanel } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="3xl">
        <SkHeader title="ადმინები" subtitle="ვისაც ადმინ პანელში შესვლა შეუძლია." />
        <SkPanel title="ადმინები" rows={2} className="mt-5" />
        <SkPanel title="მოწვევები" rows={1} className="mt-4" />
    </AdminSkeleton>;
}
