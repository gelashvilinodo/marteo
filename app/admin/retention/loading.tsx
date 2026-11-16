import { AdminSkeleton, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkHeader title="წასაშლელი ბიზნესები" subtitle="12 თვე გადაუხდელი ბიზნესები და მათი წაშლის თარიღი" />
        <SkList rows={5} />
    </AdminSkeleton>;
}
