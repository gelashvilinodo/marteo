import type { ReactNode } from 'react';
import { requireBusinessFeature } from '@/lib/business/feature-access';
export default async function FeatureLayout({children}:{children:ReactNode}) {
    await requireBusinessFeature('manufacturing');
    return children;
}
