'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';

/** Keep progress visible; dismiss only the result message after two seconds. */
export default function useTransientNotice(message: string, clear: Dispatch<SetStateAction<string>>, paused = false) {
    useEffect(() => {
        if (!message || paused || /(?:…|\.{3})$/.test(message.trim())) return;
        const timer = window.setTimeout(() => clear(''), 2000);
        return () => window.clearTimeout(timer);
    }, [message, clear, paused]);
}
