import { requirePageAccess } from "@/lib/business/access";
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import StocktakePrintPage from '@/components/dashboard/inventory/stocktake/StocktakePrintPage';
export const metadata:Metadata={title:'მარაგის უწყისი | MARTEO',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page(){if(!await getCurrentUser())redirect('/login');await requirePageAccess('INVENTORY', 'view', { feature: 'reports' });return <StocktakePrintPage/>;}
