import { hideCostsIfNeeded } from "@/lib/business/redact-costs";
import { requireDashboardSection } from "@/lib/business/access";
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { getMaterialInventoryPage } from '@/lib/material-inventory/get-page';
import MaterialInventoryView from '@/components/dashboard/material-inventory/MaterialInventoryView';
export default async function MaterialInventoryPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
    await requireDashboardSection("/dashboard/material-inventory");
    const user=await getCurrentUser();if(!user)redirect('/login');
    const member=await getCurrentBusiness();if(!member)redirect('/business/onboarding');
    return <MaterialInventoryView data={await hideCostsIfNeeded(await getMaterialInventoryPage(member.businessId,await searchParams))} showTour={!user.seenTours.includes('material-inventory')}/>;
}
