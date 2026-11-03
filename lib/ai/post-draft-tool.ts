import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { contentPlatforms, contentTypes } from "@/lib/content/content-options";
import type { AiPostDraft } from "./ai-cards";
import { tbilisiDate } from "./content-calendar-tool";
import type { AiToolContext } from "./marteo-ai-tools";

const PLATFORMS = contentPlatforms.map((item) => item.value).filter((value) => value !== "OTHER");
const TYPES = contentTypes.map((item) => item.value).filter((value) => value !== "OTHER");

export const POST_DRAFT_TOOL: Anthropic.Tool = {
    name: "prepare_post_draft",
    description:
        "Shows one post draft you wrote to the user as a card with an „add to calendar“ button. Nothing is saved: the button opens the calendar form filled with these values, and the user edits and saves it. Call it once per draft.",
    input_schema: {
        type: "object",
        properties: {
            title: { type: "string", description: "Short internal title for the calendar, up to 80 characters." },
            text: { type: "string", description: "The full post text in Georgian, ready to publish, with a call to action and hashtags at the end." },
            type: { type: "string", enum: TYPES },
            platforms: { type: "array", items: { type: "string", enum: PLATFORMS }, minItems: 1 },
            date: { type: "string", description: "Suggested day YYYY-MM-DD (Tbilisi), today or later." },
            time: { type: "string", description: "Suggested time HH:MM (24h)." },
            reason: { type: "string", description: "One short Georgian sentence on why this day and time, based on data (for example the peak order day)." },
        },
        required: ["title", "text", "type", "platforms", "date", "time"],
    },
};

export class PostDraftInputError extends Error {}

function text(value: unknown, max: number, label: string) {
    if (typeof value !== "string" || !value.trim()) throw new PostDraftInputError(`${label} is required.`);
    return value.normalize("NFC").trim().slice(0, max);
}

// მონახაზი ბაზაში არ ინახება; მხოლოდ ბარათად ჩანს და ფორმას ავსებს.
export function postDraftTool(context: AiToolContext, input: Record<string, unknown>) {
    const today = tbilisiDate(context.now.getTime());
    const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "";
    const time = typeof input.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : "";

    if (!date || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new PostDraftInputError("date must be YYYY-MM-DD.");
    if (date < today) throw new PostDraftInputError(`date must be today (${today}) or later.`);
    if (!time) throw new PostDraftInputError("time must be HH:MM.");

    const type = TYPES.find((value) => value === input.type);
    if (!type) throw new PostDraftInputError(`type must be one of ${TYPES.join(", ")}.`);

    const platforms = Array.isArray(input.platforms)
        ? [...new Set(input.platforms.filter((value): value is string => PLATFORMS.includes(value as never)))]
        : [];
    if (platforms.length === 0) throw new PostDraftInputError(`platforms must include at least one of ${PLATFORMS.join(", ")}.`);

    const draft: AiPostDraft = {
        id: crypto.randomUUID(),
        title: text(input.title, 80, "title"),
        text: text(input.text, 2200, "text"),
        type,
        platforms,
        date,
        time,
    };
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 200) : "";

    context.cards.push({
        kind: "draft",
        total: 1,
        items: [draft],
        ...(reason ? { notes: { [draft.id]: reason } } : {}),
    });

    return { shown_to_user: true, title: draft.title, date, time };
}
