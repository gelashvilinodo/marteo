import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { getPurchasesSnapshot, type PurchasesSearchParams } from "@/lib/purchases/get-purchases-snapshot";
import PurchasesView from "@/components/dashboard/purchases/PurchasesView";
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<PurchasesSearchParams> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const membership = await getCurrentBusiness();
  if (!membership) redirect("/business/onboarding");
  const snapshot = await getPurchasesSnapshot(membership.businessId, await searchParams);
  if (!snapshot.filterError && snapshot.requestedPage > snapshot.totalPages) {
    const params = new URLSearchParams();
    if (snapshot.isArchive) params.set("view", "archive");
    if (snapshot.query) params.set("q", snapshot.query);
    if (snapshot.from) params.set("from", snapshot.from);
    if (snapshot.to) params.set("to", snapshot.to);
    if (snapshot.currentPage > 1) params.set("page", String(snapshot.currentPage));
    redirect(`/dashboard/purchases${params.size ? `?${params}` : ""}`);
  }
  return <PurchasesView initialSnapshot={snapshot} />;
}
