import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
    title: "ახალი პაროლი | MARTEO",
    referrer: "no-referrer",
    robots: {
        index: false,
        follow: false,
    },
};

export default function ResetPasswordPage() {
    return (
        <AuthShell
            heading={<>ახალი პაროლი.<br />უსაფრთხო დაბრუნება.</>}
            text="შექმენით ახალი პაროლი და გააგრძელეთ ბიზნესის მართვა."
        >
            <ResetPasswordForm />
        </AuthShell>
    );
}