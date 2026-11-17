import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import AdminInviteAcceptForm from "@/components/auth/AdminInviteAcceptForm";

export const metadata: Metadata = {
    title: "მოწვევა | MARTEO",
    referrer: "no-referrer",
    robots: { index: false, follow: false },
};

export default function AdminInvitePage() {
    return <AuthShell heading={<>ერთი გუნდი.<br />ერთი პლატფორმა.</>} text="მოწვევის მიღების შემდეგ ადმინ პანელი ორეტაპიანი შესვლით დაიცავს თქვენს წვდომას.">
        <AdminInviteAcceptForm />
    </AuthShell>;
}
