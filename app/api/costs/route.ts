import { Prisma } from "@/generated/prisma/client";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { CostInputError, readCostScope } from "@/lib/costs/cost-input";
import { getCostPreview, saveMissingCosts } from "@/lib/costs/cost-resolution";
const json = (data: unknown, status = 200) => Response.json(data, {
    status,
    headers: {
        "Cache-Control": "private, no-store"
    }
});
async function handle(request: Request, saving: boolean) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        if (saving && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"))
            throw new CostInputError("მოთხოვნის წყარო ან ფორმატი არასწორია.", 403);
        const context = await getPgDashboardContext();
        if (!context?.membership)
            throw new CostInputError("გაიარე ავტორიზაცია.", 401);
        const { businessId } = context.membership;
        let body: unknown;
        if (saving) {
            const text = await request.text();
            if (new TextEncoder().encode(text).length > 100000)
                throw new CostInputError("მოთხოვნა ძალიან დიდია.");
            try {
                body = JSON.parse(text);
            }
            catch {
                throw new CostInputError("მონაცემების ფორმატი არასწორია.");
            }
        }
        const scope = readCostScope(Object.fromEntries(new URL(request.url).searchParams));
        prisma = createPrismaClient();
        const data = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw(Prisma.sql `SELECT id FROM "Business" WHERE id=${businessId} FOR UPDATE`);
            const access = await tx.businessMembership.findUnique({
                where: {
                    userId_businessId: {
                        userId: context.user.id,
                        businessId
                    }
                },
                select: {
                    role: true
                }
            });
            if (!access || !["OWNER", "ADMIN"].includes(access.role))
                throw new CostInputError("თვითღირებულების შესაცვლელად შესაბამისი უფლება არ გაქვს.", 403);
            return saving ? saveMissingCosts(tx, businessId, body) : getCostPreview(tx, businessId, scope);
        }, {
            maxWait: 10000,
            timeout: 60000
        });
        return json({
            success: true,
            data
        });
    }
    catch (e) {
        if (e instanceof CostInputError)
            return json({
                success: false,
                message: e.message
            }, e.status);
        console.error("Cost resolution failed", e instanceof Error ? e.name : "UnknownError");
        return json({
            success: false,
            message: "შენახვის შედეგი ვერ დადასტურდა. განაახლე სია და გადაამოწმე მონაცემები."
        }, 500);
    }
    finally {
        await prisma?.$disconnect();
    }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
