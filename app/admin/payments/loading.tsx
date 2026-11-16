import { AdminSkeleton, SkFilters, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="6xl">
        <SkHeader title="გადახდები" subtitle="0 გადახდა · სულ 0.00 ₾ · ახლიდან ძველისკენ" action />
        <SkFilters selects={4} />
        <SkList rows={10} avatar={false} />
    </AdminSkeleton>;
}
