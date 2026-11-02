import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import InviteAcceptForm from "@/components/auth/InviteAcceptForm";

export const metadata: Metadata = {
    title: "მოწვევა | MARTEO",
    referrer: "no-referrer",
    robots: {
        index: false,
        follow: false,
    },
};

export default function InvitePage() {
    return (
        <AuthShell
            heading={<>ერთი გუნდი.<br />ერთი ბიზნესი.</>}
            text="შეუერთდი გუნდს და მართე ბიზნესი ერთად."
        >
            <InviteAcceptForm />
        </AuthShell>
    );
}
