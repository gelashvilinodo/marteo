import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { hasBusinessFeature, businessFeatureMessage, type BusinessFeature } from './business-mode';
export async function businessFeatureDenied(feature:BusinessFeature) {
    const member=await getCurrentBusiness();
    // Existing handlers retain their own unauthenticated response and role checks.
    if(!member||hasBusinessFeature(member.business.mode,feature))return null;
    const message=businessFeatureMessage(feature);
    return Response.json({success:false,error:message,message},{status:403,headers:{'Cache-Control':'private, no-store'}});
}
export async function requireBusinessFeature(feature:BusinessFeature) {
    const member=await getCurrentBusiness();
    if(!member)redirect('/dashboard');
    if(!hasBusinessFeature(member.business.mode,feature))redirect('/dashboard/business-settings');
}
