import { Prisma } from "@/generated/prisma/client";

export function allocateCost(
    total: Prisma.Decimal,
    quantities: number[],
): Prisma.Decimal[] {
    if (!total.isFinite() || total.lt(0)) {
        throw new Error("გასანაწილებელი თვითღირებულება არასწორია.");
    }

    const centsValue = total.mul(100);

    if (!centsValue.isInteger()) {
        throw new Error("ჯამური თვითღირებულება თეთრების სიზუსტით უნდა იყოს მითითებული.");
    }

    if (
        quantities.length === 0 ||
        quantities.some(
            quantity =>
                !Number.isFinite(quantity) || quantity < 0 || !new Prisma.Decimal(quantity).mul(1000000).isInteger(),
        )
    ) {
        throw new Error("გასანაწილებელი რაოდენობები არასწორია.");
    }

    const weights = quantities.map(quantity => BigInt(new Prisma.Decimal(quantity).mul(1000000).toFixed(0)));
    const totalWeight = weights.reduce(
        (sum, quantity) => sum + quantity,
        0n,
    );

    if (totalWeight === 0n) {
        if (!total.isZero()) {
            throw new Error("დადებითი თანხა ნულოვან რაოდენობაზე ვერ განაწილდება.");
        }

        return quantities.map(() => new Prisma.Decimal(0));
    }

    const totalCents = BigInt(centsValue.toFixed(0));

    const shares = weights.map((weight, index) => {
        const numerator = totalCents * weight;

        return {
            index,
            cents: numerator / totalWeight,
            remainder: numerator % totalWeight,
        };
    });

    const allocated = shares.reduce(
        (sum, share) => sum + share.cents,
        0n,
    );

    const remainderOrder = [...shares].sort((first, second) => {
        if (first.remainder === second.remainder) {
            return first.index - second.index;
        }

        return first.remainder > second.remainder ? -1 : 1;
    });

    const remainingCents = totalCents - allocated;

    for (let index = 0; BigInt(index) < remainingCents; index++) {
        remainderOrder[index].cents += 1n;
    }

    return shares.map(
        share => new Prisma.Decimal(share.cents.toString()).div(100),
    );
}