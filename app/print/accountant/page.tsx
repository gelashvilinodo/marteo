import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import AccountantPrintPage from '@/components/dashboard/analytics/report/AccountantPrintPage';
export const metadata: Metadata = { title: 'ბიზნესის ანგარიში | MARTEO', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page() { if (!await getCurrentUser()) redirect('/login'); return <AccountantPrintPage/>; }
