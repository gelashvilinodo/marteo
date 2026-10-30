import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export const MARTEO_AI_MODEL = "claude-haiku-5-5";

export class AiChatError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

let client: Anthropic | null = null;

export function getAnthropicClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new AiChatError("მართეო AI ჯერ არ არის კონფიგურირებული.", 503);
    }

    client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 });
    return client;
}
