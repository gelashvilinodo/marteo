import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import {
    getCustomersPage,
    type CustomersSearchParams,
} from "@/lib/customers/get-customers-page";
import CustomersView from "@/components/dashboard/customers/CustomersView";

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<CustomersSearchParams>;
}) {
    const user = await getCurrentUser();

    if (!user) redirect("/login");

    const prisma = createPrismaClient();

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) redirect("/business/onboarding");

        const data = await getCustomersPage(
            prisma,
            membership.businessId,
            await searchParams,
        );

        return <CustomersView data={data} />;
    } finally {
        await prisma.$disconnect();
    }
}