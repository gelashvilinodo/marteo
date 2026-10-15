export function waitForInvoiceImage(
    image: HTMLImageElement,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

        function cleanup() {
            image.removeEventListener("load", onLoad);
            image.removeEventListener("error", onError);
            if (timeout !== undefined) clearTimeout(timeout);
        }

        function onLoad() {
            cleanup();

            if (image.naturalWidth > 0) {
                resolve();
            } else {
                reject(new Error("ინვოისის სურათი ვერ ჩაიტვირთა."));
            }
        }

        function onError() {
            cleanup();
            reject(new Error("ინვოისის სურათი ვერ ჩაიტვირთა."));
        }

        image.addEventListener("load", onLoad);
        image.addEventListener("error", onError);

        timeout = setTimeout(() => {
            cleanup();
            reject(new Error("ინვოისის სურათის ჩატვირთვის დრო ამოიწურა."));
        }, 12000);

        if (image.complete) onLoad();
    });
}