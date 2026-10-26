'use client';

import { Icon } from '@iconify/react';
import { type Dispatch, type SetStateAction } from 'react';
import useTransientNotice from './useTransientNotice';

export default function SuccessToast({message, clear}: {message:string; clear:Dispatch<SetStateAction<string>>}) {
    useTransientNotice(message, clear);
    if (!message) return null;
    return <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[1000] flex items-center gap-3 rounded-2xl border border-success/30 bg-surface p-4 shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm"><Icon icon="solar:check-circle-bold-duotone" className="h-6 w-6 shrink-0 text-success"/><p className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{message}</p><button type="button" onClick={()=>clear('')} aria-label="შეტყობინების დახურვა" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-success/10"><Icon icon="solar:close-circle-linear" className="h-5 w-5"/></button></div>;
}
