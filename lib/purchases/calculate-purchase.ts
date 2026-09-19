type PurchaseCalculationInput = {
    shippingCost: string;
    customsCost: string;
    otherCost: string;
    items: {
        quantity: string;
        unitPurchasePrice: string;
    }[];
};

// თანხებს ვითვლით მთელ თეთრებში.
function toCents(value: string, label: string): bigint {
    const normalized = value.trim() || "0";

    if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) {
        throw new Error(
            `${label}: მიუთითე არაუარყოფითი თანხა, მაქსიმუმ ორი ათწილადით.`,
        );
    }

    const [whole, fraction = ""] = normalized.split(".");

    return (
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"))
    );
}

function toQuantity(value: string): bigint {
    const normalized = value.trim();

    if (!/^\d{1,7}$/.test(normalized)) {
        throw new Error("პროდუქტის რაოდენობა უნდა იყოს დადებითი მთელი რიცხვი.");
    }

    const quantity = BigInt(normalized);

    if (quantity < 1n || quantity > 1000000n) {
        throw new Error("პროდუქტის რაოდენობა უნდა იყოს 1-დან 1 000 000-მდე.");
    }

    return quantity;
}

function toMoney(cents: bigint): string {
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function calculatePurchase(
    input: PurchaseCalculationInput,
) {
    if (input.items.length === 0) {
        throw new Error("დაამატე მინიმუმ ერთი პროდუქტი.");
    }

    if (input.items.length > 200) {
        throw new Error("ერთ პარტიაში მაქსიმუმ 200 ჩანაწერის დამატება შეიძლება.");
    }

    const shipping = toCents(input.shippingCost, "ტრანსპორტირება");
    const customs = toCents(input.customsCost, "განბაჟება");
    const other = toCents(input.otherCost, "სხვა ხარჯი");
    const extraTotal = shipping + customs + other;

    const rows = input.items.map((item, index) => {
        const quantity = toQuantity(item.quantity);
        const unitPrice = toCents(
            item.unitPurchasePrice,
            `პროდუქტი ${index + 1}`,
        );

        if (unitPrice === 0n) {
            throw new Error(
                `პროდუქტი ${index + 1}: შესყიდვის ფასი უნდა იყოს ნულზე მეტი.`,
            );
        }

        return {
            quantity,
            unitPrice,
            purchaseTotal: quantity * unitPrice,
        };
    });

    const productsTotal = rows.reduce(
        (sum, row) => sum + row.purchaseTotal,
        0n,
    );

    const allocations = rows.map((row) => {
        const numerator = extraTotal * row.purchaseTotal;

        return {
            cents: numerator / productsTotal,
            remainder: numerator % productsTotal,
        };
    });

    const allocatedTotal = allocations.reduce(
        (sum, allocation) => sum + allocation.cents,
        0n,
    );

    const remainingCents = Number(extraTotal - allocatedTotal);

    // დარჩენილი თეთრები ნაწილდება ყველაზე დიდი ნაშთის მიხედვით.
    const allocationOrder = allocations
        .map((allocation, index) => ({
            index,
            remainder: allocation.remainder,
        }))
        .sort((a, b) => {
            if (a.remainder === b.remainder) {
                return a.index - b.index;
            }

            return a.remainder > b.remainder ? -1 : 1;
        });

    for (let index = 0; index < remainingCents; index += 1) {
        allocations[allocationOrder[index].index].cents += 1n;
    }

    return {
        shippingCost: toMoney(shipping),
        customsCost: toMoney(customs),
        otherCost: toMoney(other),
        productsTotal: toMoney(productsTotal),
        extraCostTotal: toMoney(extraTotal),
        totalCost: toMoney(productsTotal + extraTotal),

        items: rows.map((row, index) => {
            const allocatedExtraCost = allocations[index].cents;
            const totalCost = row.purchaseTotal + allocatedExtraCost;

            // ერთეულის ფასი მრგვალდება უახლოეს თეთრამდე.
            const finalUnitCost =
                (totalCost * 2n + row.quantity) /
                (row.quantity * 2n);

            return {
                quantity: Number(row.quantity),
                unitPurchasePrice: toMoney(row.unitPrice),
                allocatedExtraCostTotal: toMoney(allocatedExtraCost),
                totalCost: toMoney(totalCost),
                finalUnitCost: toMoney(finalUnitCost),
            };
        }),
    };
}