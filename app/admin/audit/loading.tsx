import { AdminSkeleton, SkFilters, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="4xl">
        <SkHeader title="ადმინის ქმედებების ისტორია" subtitle="ყველა ქმედება · ნებისმიერ დროს" />
        <SkFilters selects={2} />
        <SkList rows={10} avatar={false} />
    </AdminSkeleton>;
}
