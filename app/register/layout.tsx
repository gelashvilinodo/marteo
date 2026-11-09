import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
    title: "რეგისტრაცია - MARTEO",
    description: "შექმენით მართეოს ანგარიში და სცადეთ 14 დღე უფასოდ, ბარათის გარეშე.",
};

// შესული მომხმარებელი რეგისტრაციის ფორმას აღარ ხედავს (როგორც /login-ზე).
export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
    if (await getCurrentUser()) redirect("/dashboard");
    return children;
}
