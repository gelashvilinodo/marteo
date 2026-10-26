import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { getProductionSnapshot } from '@/lib/production/snapshot';
import ProductionView from '@/components/dashboard/production/ProductionView';
export default async function ProductionPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const user=await getCurrentUser();if(!user)redirect('/login');const member=await getCurrentBusiness();if(!member)redirect('/business/onboarding');return <ProductionView initial={await getProductionSnapshot(member.businessId,await searchParams,user.id)}/>;}
