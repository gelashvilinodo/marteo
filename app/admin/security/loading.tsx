import { AdminSkeleton, SkHeader, SkPanel } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="3xl">
        <SkHeader title="უსაფრთხოება" subtitle="ადმინ პანელი ორეტაპიანი შესვლით არის დაცული: ახალ მოწყობილობაზე პაროლის შემდეგ კოდის აპის კოდიც საჭიროა." />
        <SkPanel title="სანდო მოწყობილობები" rows={2} className="mt-5" />
        <SkPanel title="სარეზერვო კოდები" rows={1} className="mt-4" />
        <SkPanel title="ახალი ტელეფონი" rows={1} className="mt-4" />
    </AdminSkeleton>;
}
