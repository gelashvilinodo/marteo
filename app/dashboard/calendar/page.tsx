import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { getCalendarPage } from "@/lib/content/get-calendar-page";
import type { CalendarSearchParams } from "@/lib/content/calendar-period";
import CalendarView from "@/components/dashboard/calendar/CalendarView";

export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<CalendarSearchParams>;
}) {
    if (!(await getCurrentUser())) redirect("/login");

    const membership = await getCurrentBusiness();
    if (!membership) redirect("/business/onboarding");

    const params = await searchParams;
    const prisma = createPrismaClient();

    const data = await (async () => {
        try {
            return await prisma.$transaction(
                tx => getCalendarPage(tx, membership.businessId, params),
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.RepeatableRead,
                    maxWait: 10000,
                    timeout: 15000,
                },
            );
        } finally {
            await prisma.$disconnect();
        }
    })();

    return <CalendarView initialData={data} />;
}