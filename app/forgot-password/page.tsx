import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
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
        <AuthShell
            heading={<>პაროლი დაგავიწყდა?<br />არაუშავს.</>}
            text="მიუთითეთ ელფოსტა და აღდგენის ბმულს გამოგიგზავნით."
        >
            <ForgotPasswordForm />
        </AuthShell>
    );
}