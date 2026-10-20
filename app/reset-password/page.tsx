import type { Metadata } from "next";
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
        <main className="flex min-h-dvh min-w-0 items-center justify-center bg-background px-4 py-8">
            <ResetPasswordForm />
        </main>
    );
}