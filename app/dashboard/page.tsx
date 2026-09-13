import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main>
      <h1>MARTEO Dashboard</h1>
      <p>მოგესალმები, {user.firstName || user.email}</p>
    </main>
  );
}