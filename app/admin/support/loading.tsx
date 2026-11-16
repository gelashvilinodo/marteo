import { AdminSkeleton, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="4xl">
        <SkHeader title="დახმარება" subtitle="მომხმარებლების მიმოწერა: ღია საუბრები ზემოთ." action />
        <SkList rows={8} />
    </AdminSkeleton>;
}
