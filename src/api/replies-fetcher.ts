import { requestUrl } from "obsidian";
import type { XTweet, XUser } from "./types";
import { RateLimiter } from "./rate-limiter";
import type { Logger } from "../utils/logger";

export interface ReplyData {
	author: string;
	authorName: string;
	text: string;
	likes: number;
	urls: string[];
	tweetId: string;
}

export interface RepliesResult {
	replies: ReplyData[];
	totalFound: number;
}

export class RepliesFetcher {
	private rateLimiter: RateLimiter;
	private logger?: Logger;

	constructor(logger?: Logger, rateLimitMax = 60) {
		this.rateLimiter = new RateLimiter(rateLimitMax, 15 * 60 * 1000);
		this.logger = logger;
	}

	async fetchReplies(
		conversationId: string,
		accessToken: string,
		maxResults = 50
	): Promise<RepliesResult> {
		await this.rateLimiter.waitIfNeeded();

		const params = new URLSearchParams({
			query: `conversation_id:${conversationId} -is:retweet`,
			max_results: String(Math.min(maxResults, 100)),
			"tweet.fields":
				"author_id,created_at,public_metrics,entities,text",
			expansions: "author_id",
			"user.fields": "name,username",
		});

		const url = `https://api.x.com/2/tweets/search/recent?${params.toString()}`;

		this.logger?.debug("Fetching replies", url);

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		this.rateLimiter.recordRequest();

		if (response.status === 429) {
			throw new Error(
				"Search API rate limited. Replies review will retry later."
			);
		}

		if (response.status !== 200) {
			throw new Error(
				`Search API error (${response.status}): ${response.text}`
			);
		}

		const data = response.json;
		const tweets: XTweet[] = data.data || [];
		const users: XUser[] = data.includes?.users || [];

		const userMap = new Map<string, XUser>();
		for (const user of users) {
			userMap.set(user.id, user);
		}

		const replies: ReplyData[] = tweets
			.filter((t) => t.id !== conversationId)
			.map((tweet) => {
				const user = userMap.get(tweet.author_id);
				const urls = (tweet.entities?.urls || [])
					.map((u) => u.expanded_url || u.url)
					.filter(
						(u) =>
							!/^https?:\/\/(x\.com|twitter\.com)/i.test(u)
					);

				return {
					author: user?.username || "unknown",
					authorName: user?.name || "Unknown",
					text: tweet.text,
					likes: tweet.public_metrics?.like_count || 0,
					urls,
					tweetId: tweet.id,
				};
			})
			.sort((a, b) => b.likes - a.likes);

		this.logger?.debug(
			`Found ${replies.length} replies for conversation ${conversationId}`
		);

		return {
			replies,
			totalFound: data.meta?.result_count || 0,
		};
	}
}
