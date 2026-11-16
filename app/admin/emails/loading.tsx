import { AdminSkeleton, SkFilters, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="4xl">
        <SkHeader title="ელფოსტის ჟურნალი" subtitle="ბოლო 24 საათი: 0 გაიგზავნა · 0 ვერ გაიგზავნა · 0 ლიმიტით შეჩერდა" />
        <SkFilters selects={2} />
        <SkList rows={10} avatar={false} />
    </AdminSkeleton>;
}
