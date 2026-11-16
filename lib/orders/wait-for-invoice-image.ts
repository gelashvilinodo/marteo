// ბეჭდვამდე ინვოისის სურათების ლოდინი.
// ვერ ჩატვირთული სურათი ბეჭდვას არ აჩერებს: ის იმალება და ბეჭდვა გრძელდება.

const BASE_TIMEOUT = 12000;
const PER_IMAGE = 150;
const MAX_TIMEOUT = 60000;

// სურათების რაოდენობის მიხედვით: ბევრ ინვოისს ცოტა მეტი დრო ეძლევა.
export function invoiceImageTimeout(count: number): number {
    return Math.min(MAX_TIMEOUT, BASE_TIMEOUT + count * PER_IMAGE);
}

// true — ჩაიტვირთა, false — ვერ ჩაიტვირთა და დაიმალა.
export function waitForInvoiceImage(
    image: HTMLImageElement,
    timeoutMs = BASE_TIMEOUT,
): Promise<boolean> {
    // lazy სურათი ეკრანს მიღმა საერთოდ არ იწყებს ჩატვირთვას.
    if (image.loading !== "eager") image.loading = "eager";

    return new Promise(resolve => {
        function cleanup() {
            image.removeEventListener("load", onLoad);
            image.removeEventListener("error", onError);
            clearTimeout(timeout);
        }

        function show() {
            image.style.visibility = "";
        }

        function hide() {
            image.style.visibility = "hidden";
        }

        function onLoad() {
            cleanup();

            if (image.naturalWidth > 0) {
                show();
                resolve(true);
            } else {
                hide();
                resolve(false);
            }
        }

        function onError() {
            cleanup();
            hide();
            resolve(false);
        }

        image.addEventListener("load", onLoad);
        image.addEventListener("error", onError);

        const timeout = setTimeout(() => {
            cleanup();
            hide();
            // თუ მოგვიანებით მაინც ჩაიტვირთა, ისევ გამოჩნდეს.
            image.addEventListener("load", () => {
                if (image.naturalWidth > 0) show();
            }, { once: true });
            resolve(false);
        }, timeoutMs);

        if (image.complete) onLoad();
    });
}

// ყველა სურათს ელოდება და აბრუნებს, რამდენი ვერ ჩაიტვირთა.
export async function waitForInvoiceImages(
    images: HTMLImageElement[],
): Promise<number> {
    const timeoutMs = invoiceImageTimeout(images.length);
    const results = await Promise.all(
        images.map(image => waitForInvoiceImage(image, timeoutMs)),
    );
    return results.filter(loaded => !loaded).length;
}
