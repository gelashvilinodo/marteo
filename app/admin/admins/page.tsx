import { notFound } from "next/navigation";
import { adminMetadata } from "@/lib/admin/metadata";
import { getAdminUser } from "@/lib/admin/authorization";
import { getAdminTeam, isPlatformOwner, MAX_ADMINS } from "@/lib/admin/admin-team";
import AdminTeamPanel from "@/components/admin/AdminTeamPanel";
import { createPrismaClient } from "@/lib/prisma";

export function generateMetadata() {
    return adminMetadata("ადმინები · ადმინ პანელი");
}

export default async function AdminTeamPage() {
    const admin = await getAdminUser();
    if (!admin) notFound();
    const prisma = createPrismaClient();
    const [team, isOwner] = await Promise.all([getAdminTeam(prisma), isPlatformOwner(prisma, admin.id)]).finally(() => prisma.$disconnect());

    return <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-text-primary">ადმინები</h1>
        <p className="mt-1 text-sm text-text-secondary">
            ადმინი ხედავს ყველა ბიზნესს, მომხმარებელს და გადახდას. ახალი ადმინი ემატება მხოლოდ ელფოსტით მოწვევით, მიღების შემდეგ კი ორეტაპიან შესვლას ჩართავს.
            {isOwner ? ` მოწვევა და მოხსნა მხოლოდ შენ, პლატფორმის მფლობელს, შეგიძლია (მაქსიმუმ ${MAX_ADMINS} ადმინი).` : " ადმინების დამატება და მოხსნა მხოლოდ პლატფორმის მფლობელს შეუძლია."}
        </p>
        <div className="mt-5">
            <AdminTeamPanel
                isOwner={isOwner}
                currentId={admin.id}
                members={team.members.map(member => ({ ...member, joinedAt: member.joinedAt?.toISOString() ?? null }))}
                pending={team.pending.map(invite => ({ ...invite, createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt.toISOString() }))}
            />
        </div>
    </div>;
}
