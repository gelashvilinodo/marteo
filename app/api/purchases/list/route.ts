import { businessFeatureDenied } from '@/lib/business/feature-access';
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getPurchasesSnapshot } from "@/lib/purchases/get-purchases-snapshot";
import { orderJson } from "@/lib/orders/order-http";
export async function GET(request: Request) {
    const denied=await businessFeatureDenied('imports');if(denied)return denied;

    try {
        if (!(await getCurrentUser())) return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
        const membership = await getCurrentBusiness();
        if (!membership) return orderJson({ success: false, message: "ბიზნესი ვერ მოიძებნა." }, 403);
        const data = await getPurchasesSnapshot(membership.businessId, Object.fromEntries(new URL(request.url).searchParams));
        return orderJson({ success: true, data });
    } catch (cause) {
        console.error("Purchase list refresh failed", cause instanceof Error ? cause.name : "UnknownError");
        return orderJson({ success: false, message: "პარტიების სია ვერ განახლდა. სცადე ხელახლა." }, 500);
    }
}
