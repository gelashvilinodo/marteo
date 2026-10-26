import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { getMaterialInventoryPage } from '@/lib/material-inventory/get-page';
import MaterialInventoryView from '@/components/dashboard/material-inventory/MaterialInventoryView';
export default async function MaterialInventoryPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
    if(!await getCurrentUser())redirect('/login');
    const member=await getCurrentBusiness();if(!member)redirect('/business/onboarding');
    return <MaterialInventoryView data={await getMaterialInventoryPage(member.businessId,await searchParams)}/>;
}
