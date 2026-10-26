import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getMaterialSnapshot } from "@/lib/material-purchases/snapshot";
import MaterialPurchasesView from "@/components/dashboard/material-purchases/MaterialPurchasesView";
export default async function MaterialPurchasesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
    if(!await getCurrentUser())redirect('/login');
    const m=await getCurrentBusiness();if(!m)redirect('/business/onboarding');
    return <MaterialPurchasesView initialSnapshot={await getMaterialSnapshot(m.businessId,await searchParams)}/>;
}
