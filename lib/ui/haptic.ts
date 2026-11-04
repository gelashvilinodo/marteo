// მსუბუქი ვიბრაცია (haptic) ტელეფონზე. Android-ს Vibration API აქვს; iPhone-ზე ის არ არსებობს,
// ამიტომ iOS 18+-ზე ვიყენებთ Safari-ს სისტემურ გადამრთველს (<input switch>): მისი დაჭერა
// მსუბუქ ვიბრაციას იწვევს. ძველ iOS-ზე უბრალოდ არაფერი ხდება.
export function hapticTap() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(10);
        return;
    }
    if (typeof document === "undefined") return;
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
}
