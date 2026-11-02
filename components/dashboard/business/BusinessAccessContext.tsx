'use client';
import { createContext, useContext, useMemo } from 'react';
import {
    canSeeCosts,
    isBusinessOwner,
    meetsNeed,
    sectionNeed,
    type AccessLevel,
    type BusinessAccess,
    type SectionNeed,
} from '@/lib/business/permissions';

// მხოლოდ ინტერფეისისთვის: ღილაკების და მენიუს დამალვა. წვდომას სერვერი ამოწმებს.
const OWNER_ACCESS: BusinessAccess = { role: 'OWNER', permissions: [], readOnly: false, status: 'ACTIVE' };
export const BusinessAccessContext = createContext<BusinessAccess>(OWNER_ACCESS);

export function useBusinessAccess() {
    const access = useContext(BusinessAccessContext);
    return useMemo(() => ({
        access,
        isOwner: isBusinessOwner(access),
        canSeeCosts: canSeeCosts(access),
        can: (need: SectionNeed, level: AccessLevel = 'view') => meetsNeed(access, need, level),
        canOpen: (path: string) => meetsNeed(access, sectionNeed(path)),
    }), [access]);
}
