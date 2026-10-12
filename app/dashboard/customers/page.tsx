import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/auth/current-business";
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

    const membership = await getCurrentBusiness();

    if (!membership) {
        redirect("/business/onboarding");
    }

    const prisma = createPrismaClient();

    try {
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