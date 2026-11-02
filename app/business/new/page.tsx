import { redirect } from "next/navigation";

import BusinessCreateForm from "@/components/dashboard/business/BusinessCreateForm";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";

export default async function NewBusinessPage() {
    if (!(await getCurrentUser())) redirect("/login");
    // A user without any business still finishes sign-up on the onboarding step.
    if (!(await getCurrentBusiness())) redirect("/business/onboarding");

    return <BusinessCreateForm variant="additional" />;
}
