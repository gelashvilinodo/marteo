import BusinessCreateForm from "@/components/dashboard/business/BusinessCreateForm";
import AccountDeleteSection from "@/components/account/AccountDeleteSection";

export default function BusinessOnboardingPage() {
    return <>
        <BusinessCreateForm variant="onboarding" />
        {/* ბიზნესის გარეშე პროფილის გვერდი მიუწვდომელია, ამიტომ ანგარიშის წაშლა აქედანაც შეიძლება. */}
        <div className="flex justify-center px-4 pb-10 pt-2">
            <AccountDeleteSection variant="link" />
        </div>
    </>;
}
