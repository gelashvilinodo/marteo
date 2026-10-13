"use client";

import { useEffect } from "react";

function backdropDialog(
    target: EventTarget | null,
    x: number,
    y: number,
): HTMLDialogElement | null {
    if (
        !(target instanceof HTMLDialogElement) ||
        !target.matches(":modal")
    ) {
        return null;
    }

    const rect = target.getBoundingClientRect();
    const outside =
        x < rect.left ||
        x > rect.right ||
        y < rect.top ||
        y > rect.bottom;

    return outside ? target : null;
}

export default function ModalBackdropDismiss() {
    useEffect(() => {
        let pressedDialog: HTMLDialogElement | null = null;

        function pointerDown(event: PointerEvent) {
            pressedDialog =
                event.isPrimary && event.button === 0
                    ? backdropDialog(
                          event.target,
                          event.clientX,
                          event.clientY,
                      )
                    : null;
        }

        function pointerCancel() {
            pressedDialog = null;
        }

        function click(event: MouseEvent) {
            const dialog = backdropDialog(
                event.target,
                event.clientX,
                event.clientY,
            );

            const startedOutside = pressedDialog === dialog;
            pressedDialog = null;

            if (!dialog || !startedOutside || event.detail === 0) {
                return;
            }

            // გვერდზე არსებული backdrop-click მოქმედება მეორედ
            // არ გაეშვას და გაფრთხილება არ გაორმაგდეს.
            event.preventDefault();
            event.stopImmediatePropagation();

            const cancel = new Event("cancel", {
                cancelable: true,
            });

            const allowed = dialog.dispatchEvent(cancel);

            // ფორმის onCancel-ს შეუძლია დახურვა აკრძალოს ან
            // საკუთარი გაფრთხილება/დახურვის ანიმაცია გამოიყენოს.
            if (allowed && dialog.open) {
                dialog.close();
            }
        }

        document.addEventListener("pointerdown", pointerDown, true);
        document.addEventListener("pointercancel", pointerCancel, true);
        document.addEventListener("click", click, true);

        return () => {
            document.removeEventListener("pointerdown", pointerDown, true);
            document.removeEventListener("pointercancel", pointerCancel, true);
            document.removeEventListener("click", click, true);
        };
    }, []);

    return null;
}