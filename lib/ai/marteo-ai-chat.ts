import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AiChatError, getAnthropicClient, MARTEO_AI_MODEL } from "./anthropic-client";
import { AI_TOOLS, executeAiTool, type AiToolContext } from "./marteo-ai-tools";
import { mergeCardGroups, type AiCardGroup } from "./ai-cards";

export { AiChatError } from "./anthropic-client";

const MAX_TOOL_ROUNDS = 5;

export type AiChatTurn = { role: "user" | "assistant"; text: string };


const SYSTEM_PROMPT = `You are Marteo AI, the assistant inside Marteo, a business management app for small Georgian online shops (orders, purchases, inventory, analytics).

Answer the owner's questions about their own business data. Reply in Georgian, short and clear: the answer first, then one or two useful details at most. Format money as 1 234.50 ₾. When an answer depends on a period, say which dates it covers. Write plain text; **bold** for a key number is the only formatting allowed (no headings, tables or links). Use the Georgian labels the tools return (for example ამოწურული, მცირე მარაგი) instead of your own wording.

Rules:
- Found orders, products and customers are shown to the user as cards right under your reply (photo, status, total, phone and a details button). Do not list them one by one: for one record give a short text summary of the key facts; for several, give the count and one or two notable points. When found is larger than the records you received, mention the total.
- Use only numbers returned by the tools. Never estimate or invent figures, and never redo percent calculations that a tool already returned.
- "ამ თვეში" means this_month (from the 1st until today), "ამ კვირაში" means this_week. If the user names no period for a money or order question, use this_month.
- When profit is null, explain that some product costs are not filled in yet, and give partial_profit as the profit of the orders whose costs are known.
- You can only read data. You cannot create, edit or delete orders, purchases, products or anything else. If asked to, say so politely and name the Marteo page where the user can do it (შეკვეთები, შესყიდვები, მარაგები, ანალიტიკა). Restock cards have a „შესაძენ სიაში დამატება" button the user can press themselves; the list is on the შესყიდვები page.
- For advice ("რა ვიყიდო", "რა მთავრდება სწრაფად", "რჩევები", "რა არ იყიდება", "რომელი ფერი იყიდება", etc.) use get_business_advice. Give concrete, practical advice in plain words, always with the reason from the data (for example: sold 18 in 30 days, runs out in 4 days). Suggested quantities, days and percentages come only from the tool. Do not recommend buying a product whose already_in_purchase_list is set; mention it is already in the list. When a topic returns nothing, say there is nothing to worry about there. Present it as a recommendation, not a guarantee.
- data_status no_data means the account is new: say warmly that there is no data yet, so there is nothing to analyse, and that advice will appear once they add products through a purchase (შესყიდვები) and record orders (შეკვეთები). data_status no_sales means products exist but nothing was sold in the last 90 days: say sales-based advice (what to buy, what sells) needs some orders first, and still share any other findings. Never describe these cases as a loading problem or an error. The same goes for other tools: when they find no orders, products or customers, say plainly there are none yet (or none for that search).
- Material (raw material) stock and purchase import from files are not available to you yet; say so if asked.
- If a question is unrelated to the business, answer briefly that you help with Marteo data.
- Earlier assistant replies in this conversation were based on data that is no longer shown. Treat them as correct, do not re-check or comment on them, and never mention tools or how you got the data.`;

function buildSystem(businessName: string, now: Date) {
    const today = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return `${SYSTEM_PROMPT}\n\nBusiness: ${businessName}\nToday (Tbilisi): ${today}`;
}

export async function runMarteoAiChat(
    turns: AiChatTurn[],
    businessName: string,
    context: Omit<AiToolContext, "cards">,
): Promise<{ text: string; cards: AiCardGroup[] }> {
    const anthropic = getAnthropicClient();
    const system = buildSystem(businessName, context.now);
    const messages: Anthropic.MessageParam[] = turns.map((turn) => ({ role: turn.role, content: turn.text }));
    const tools: AiToolContext = { ...context, cards: [] };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        let response: Anthropic.Message;

        try {
            response = await anthropic.messages.create({
                model: MARTEO_AI_MODEL,
                max_tokens: 2048,
                output_config: { effort: "low" },
                system,
                tools: AI_TOOLS,
                messages,
            });
        } catch (error) {
            if (error instanceof Anthropic.RateLimitError) {
                throw new AiChatError("მართეო AI ახლა გადატვირთულია. სცადე ცოტა ხანში.", 429);
            }
            if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
                console.error("Marteo AI credentials rejected");
                throw new AiChatError("მართეო AI დროებით მიუწვდომელია.", 503);
            }
            if (error instanceof Anthropic.APIError) {
                console.error("Marteo AI request failed", error.status);
                throw new AiChatError("მართეო AI დროებით მიუწვდომელია. სცადე ხელახლა.", 502);
            }
            throw error;
        }

        if (response.stop_reason === "refusal") {
            return { text: "ამ კითხვაზე პასუხს ვერ გავცემ. მკითხე შეკვეთებზე, მოგებაზე ან მარაგზე.", cards: [] };
        }

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("\n")
            .trim();

        if (response.stop_reason !== "tool_use") {
            if (text) return { text, cards: mergeCardGroups(tools.cards).filter((group) => group.items.length > 0) };
            throw new AiChatError("პასუხი ვერ მომზადდა. სცადე კითხვის სხვაგვარად დასმა.", 502);
        }

        // thinking ბლოკებიც უცვლელად ბრუნდება, როგორც API მოითხოვს.
        messages.push({ role: "assistant", content: response.content });

        const toolBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
        );
        const results = await Promise.all(toolBlocks.map((block) => executeAiTool(block, tools)));

        messages.push({ role: "user", content: results });
    }

    throw new AiChatError("კითხვა ძალიან რთული აღმოჩნდა. სცადე უფრო კონკრეტულად.", 502);
}
