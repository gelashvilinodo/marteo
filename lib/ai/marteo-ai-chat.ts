import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AiChatError, getAnthropicClient, MARTEO_AI_MODEL } from "./anthropic-client";
import { AI_TOOLS, executeAiTool, type AiToolContext } from "./marteo-ai-tools";

export { AiChatError } from "./anthropic-client";

const MAX_TOOL_ROUNDS = 5;

export type AiChatTurn = { role: "user" | "assistant"; text: string };


const SYSTEM_PROMPT = `You are Marteo AI, the assistant inside Marteo, a business management app for small Georgian online shops (orders, purchases, inventory, analytics).

Answer the owner's questions about their own business data. Reply in Georgian, short and clear: the answer first, then one or two useful details at most. Format money as 1 234.50 ₾. When an answer depends on a period, say which dates it covers. Write plain text; **bold** for a key number is the only formatting allowed (no headings, tables or links). Use the Georgian labels the tools return (for example ამოწურული, მცირე მარაგი) instead of your own wording.

Rules:
- Use only numbers returned by the tools. Never estimate or invent figures, and never redo percent calculations that a tool already returned.
- "ამ თვეში" means this_month (from the 1st until today), "ამ კვირაში" means this_week. If the user names no period for a money or order question, use this_month.
- When profit is null, explain that some product costs are not filled in yet, and give partial_profit as the profit of the orders whose costs are known.
- You can only read data. You cannot create, edit or delete orders, purchases, products or anything else. If asked to, say so politely and name the Marteo page where the user can do it (შეკვეთები, შესყიდვები, მარაგები, ანალიტიკა).
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
    context: AiToolContext,
): Promise<string> {
    const anthropic = getAnthropicClient();
    const system = buildSystem(businessName, context.now);
    const messages: Anthropic.MessageParam[] = turns.map((turn) => ({ role: turn.role, content: turn.text }));

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
            return "ამ კითხვაზე პასუხს ვერ გავცემ. მკითხე შეკვეთებზე, მოგებაზე ან მარაგზე.";
        }

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("\n")
            .trim();

        if (response.stop_reason !== "tool_use") {
            if (text) return text;
            throw new AiChatError("პასუხი ვერ მომზადდა. სცადე კითხვის სხვაგვარად დასმა.", 502);
        }

        // thinking ბლოკებიც უცვლელად ბრუნდება, როგორც API მოითხოვს.
        messages.push({ role: "assistant", content: response.content });

        const toolBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
        );
        const results = await Promise.all(toolBlocks.map((block) => executeAiTool(block, context)));

        messages.push({ role: "user", content: results });
    }

    throw new AiChatError("კითხვა ძალიან რთული აღმოჩნდა. სცადე უფრო კონკრეტულად.", 502);
}
