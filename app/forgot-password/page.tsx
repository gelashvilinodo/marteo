import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
    title: "პაროლის აღდგენა | MARTEO",
    robots: {
        index: false,
        follow: false,
    },
};

export default function ForgotPasswordPage() {
    return (
        <main className="flex min-h-dvh min-w-0 items-center justify-center bg-background px-4 py-8">
            <ForgotPasswordForm />
        </main>
    );
}