import type { XBookmarksSyncSettings } from "../settings";
import type { XTweet, XBookmarksResponse } from "../api/types";
import { RepliesFetcher } from "../api/replies-fetcher";
import { GrokClient } from "../api/grok-client";
import type { Logger } from "../utils/logger";

export interface RepliesReviewResult {
	discussionSummary: string;
	repliesAnalyzed: number;
	hasContent: boolean;
}

const EMPTY_RESULT: RepliesReviewResult = {
	discussionSummary: "",
	repliesAnalyzed: 0,
	hasContent: false,
};

export class RepliesReviewer {
	private settings: XBookmarksSyncSettings;
	private repliesFetcher: RepliesFetcher;
	private logger?: Logger;

	constructor(settings: XBookmarksSyncSettings, logger?: Logger) {
		this.settings = settings;
		this.repliesFetcher = new RepliesFetcher(
			logger,
			60
		);
		this.logger = logger;
	}

	async reviewTweet(
		tweet: XTweet,
		includes: XBookmarksResponse["includes"],
		accessToken: string
	): Promise<RepliesReviewResult> {
		const conversationId = tweet.conversation_id || tweet.id;

		const replyCount = tweet.public_metrics?.reply_count || 0;
		if (replyCount === 0) {
			this.logger?.debug(
				`Tweet ${tweet.id}: no replies, skipping review`
			);
			return EMPTY_RESULT;
		}

		if (!this.settings.grokApiKey) {
			this.logger?.warn(
				"Grok API key not configured, skipping reply review"
			);
			return EMPTY_RESULT;
		}

		this.logger?.info(
			`Fetching replies for tweet ${tweet.id} (${replyCount} replies)`
		);

		const repliesResult = await this.repliesFetcher.fetchReplies(
			conversationId,
			accessToken,
			this.settings.maxRepliesToAnalyze * 2
		);

		if (repliesResult.replies.length === 0) {
			this.logger?.debug(
				`Tweet ${tweet.id}: no replies found via search API (may be older than 7 days)`
			);
			return EMPTY_RESULT;
		}

		const topReplies = repliesResult.replies.slice(
			0,
			this.settings.maxRepliesToAnalyze
		);

		this.logger?.info(
			`Summarizing ${topReplies.length} replies for tweet ${tweet.id}`
		);

		const author = includes?.users?.find(
			(u) => u.id === tweet.author_id
		);
		const originalText = tweet.note_tweet?.text || tweet.text;

		const grokClient = new GrokClient(
			this.settings.grokApiKey,
			this.logger
		);
		const summary = await grokClient.summarizeReplies(
			originalText,
			author?.username || "unknown",
			topReplies.map((r) => ({
				author: r.author,
				text: r.text,
				likes: r.likes,
			}))
		);

		const markdownSection = this.formatSummarySection(
			summary.summary,
			summary.topInsights,
			summary.keyLinks,
			topReplies.length,
			repliesResult.totalFound
		);

		return {
			discussionSummary: markdownSection,
			repliesAnalyzed: topReplies.length,
			hasContent: true,
		};
	}

	private formatSummarySection(
		summary: string,
		insights: string[],
		links: { url: string; context: string }[],
		analyzed: number,
		totalFound: number
	): string {
		const parts: string[] = [];

		parts.push("## Discussion Summary");
		parts.push("");
		parts.push(
			`*Based on ${analyzed} top replies out of ${totalFound} found*`
		);
		parts.push("");
		parts.push(summary);

		if (insights.length > 0) {
			parts.push("");
			parts.push("### Key Insights");
			for (const insight of insights) {
				parts.push(`- ${insight}`);
			}
		}

		if (links.length > 0) {
			parts.push("");
			parts.push("### Links from Discussion");
			for (const link of links) {
				parts.push(`- [${link.context}](${link.url})`);
			}
		}

		return parts.join("\n");
	}
}
