import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@iconify/react";

import AuthShell, { authCardClass, authPrimaryButtonClass } from "@/components/auth/AuthShell";
import LogoutButton from "@/components/auth/LogoutButton";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

export const metadata: Metadata = { title: "წვდომა შეჩერებულია | MARTEO", robots: { index: false, follow: false } };

// ჩანს მაშინ, როცა მომხმარებლის ყველა ბიზნესი გაყინულია გეგმის ლიმიტის გამო.
export default async function FrozenPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const prisma = createPrismaClient();
    try {
        const memberships = await prisma.businessMembership.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { status: true, business: { select: { name: true } } },
        });
        if (memberships.some(member => member.status === "ACTIVE")) redirect("/dashboard");
        const frozen = memberships.filter(member => member.status === "FROZEN");
        if (!frozen.length) redirect("/business/onboarding");
        const names = frozen.map(member => `„${member.business.name}“`).join(", ");
        return (
            <AuthShell heading={<>წვდომა<br />დროებით შეჩერებულია.</>} text="შენი მონაცემები და ანგარიში უსაფრთხოდაა.">
                <div className={authCardClass}>
                    <Icon icon="solar:snowflake-linear" className="size-12 text-accent" aria-hidden="true" />
                    <h2 className="mt-3 text-xl font-semibold text-text-primary">ბიზნესში შესვლა ახლა ვერ ხერხდება</h2>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {names} ბიზნესის გეგმა შეიცვალა და გუნდის წევრების ლიმიტი შემცირდა. ლიმიტში ჯერ ადრე დამატებული წევრები დარჩნენ, ამიტომ შენი წვდომა დროებით შეჩერდა.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                        წვდომა ავტომატურად აღდგება, როცა ბიზნესის მფლობელი გეგმას გააუმჯობესებს ან გუნდში ადგილი გათავისუფლდება.
                    </p>
                    <Link href="/business/onboarding" className={`mt-6 ${authPrimaryButtonClass}`}>საკუთარი ბიზნესის შექმნა</Link>
                    <div className="mt-3"><LogoutButton /></div>
                </div>
            </AuthShell>
        );
    } finally {
        await prisma.$disconnect();
    }
}
