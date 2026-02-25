import { requestUrl } from "obsidian";
import type { Logger } from "../utils/logger";

export interface GrokSummaryResult {
	summary: string;
	keyLinks: { url: string; context: string }[];
	topInsights: string[];
}

export class GrokClient {
	private apiKey: string;
	private logger?: Logger;

	constructor(apiKey: string, logger?: Logger) {
		this.apiKey = apiKey;
		this.logger = logger;
	}

	async summarizeReplies(
		originalTweetText: string,
		originalAuthor: string,
		replies: { author: string; text: string; likes: number }[]
	): Promise<GrokSummaryResult> {
		const prompt = this.buildPrompt(
			originalTweetText,
			originalAuthor,
			replies
		);

		this.logger?.debug("Calling Grok API for reply summarization");

		const response = await requestUrl({
			url: "https://api.x.ai/v1/chat/completions",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: "grok-3-mini-fast",
				messages: [
					{
						role: "system",
						content:
							"You are a research assistant that summarizes Twitter/X discussions. Be concise and factual. Return valid JSON only, no markdown wrapping.",
					},
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.3,
			}),
		});

		if (response.status !== 200) {
			throw new Error(
				`Grok API error (${response.status}): ${response.text}`
			);
		}

		const data = response.json;
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			throw new Error("Grok API returned empty response");
		}

		this.logger?.debug("Grok API response received, parsing...");
		return this.parseResponse(content);
	}

	private buildPrompt(
		originalText: string,
		originalAuthor: string,
		replies: { author: string; text: string; likes: number }[]
	): string {
		const repliesBlock = replies
			.map((r) => `@${r.author} (${r.likes} likes): ${r.text}`)
			.join("\n\n");

		return `Analyze this X/Twitter discussion.

Original tweet by @${originalAuthor}:
"${originalText}"

Top ${replies.length} replies by engagement:
${repliesBlock}

Return a JSON object with:
{
  "summary": "2-3 sentence summary of the discussion's main themes and conclusions",
  "keyLinks": [{"url": "...", "context": "brief description of what this link is about"}],
  "topInsights": ["insight 1", "insight 2", "insight 3"]
}

Only include keyLinks if URLs appear in the replies. Include 2-4 topInsights capturing the most valuable points from replies.`;
	}

	private parseResponse(content: string): GrokSummaryResult {
		let jsonStr = content;
		const codeBlockMatch = content.match(
			/```(?:json)?\s*([\s\S]*?)```/
		);
		if (codeBlockMatch) {
			jsonStr = codeBlockMatch[1].trim();
		}

		try {
			const parsed = JSON.parse(jsonStr);
			return {
				summary: parsed.summary || "No summary available.",
				keyLinks: Array.isArray(parsed.keyLinks)
					? parsed.keyLinks
					: [],
				topInsights: Array.isArray(parsed.topInsights)
					? parsed.topInsights
					: [],
			};
		} catch {
			this.logger?.warn(
				"Failed to parse Grok JSON response, using raw text"
			);
			return {
				summary: content.slice(0, 500),
				keyLinks: [],
				topInsights: [],
			};
		}
	}
}
