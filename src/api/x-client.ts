import { requestUrl } from "obsidian";
import type { XBookmarksResponse, XBookmarkFoldersResponse, XTweet } from "./types";
import { RateLimiter } from "./rate-limiter";
import type { Logger } from "../utils/logger";

const BOOKMARKS_TWEET_FIELDS = [
	"created_at",
	"public_metrics",
	"author_id",
	"entities",
	"attachments",
	"text",
	"note_tweet",
	"referenced_tweets",
	"conversation_id",
].join(",");

const BOOKMARKS_EXPANSIONS = [
	"author_id",
	"attachments.media_keys",
	"referenced_tweets.id",
].join(",");

const BOOKMARKS_USER_FIELDS = "name,username";
const BOOKMARKS_MEDIA_FIELDS = "url,type,alt_text,preview_image_url";

export class XClient {
	private rateLimiter = new RateLimiter();
	private logger?: Logger;

	constructor(logger?: Logger) {
		this.logger = logger;
	}

	async fetchTweetById(
		tweetId: string,
		accessToken: string
	): Promise<{
		tweet: XTweet;
		includes?: XBookmarksResponse["includes"];
	}> {
		await this.rateLimiter.waitIfNeeded();

		const params = new URLSearchParams({
			"tweet.fields": BOOKMARKS_TWEET_FIELDS,
			expansions: BOOKMARKS_EXPANSIONS,
			"user.fields": BOOKMARKS_USER_FIELDS,
			"media.fields": BOOKMARKS_MEDIA_FIELDS,
		});

		const url = `https://api.x.com/2/tweets/${tweetId}?${params.toString()}`;

		this.logger?.debug("Fetching tweet", tweetId);

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		this.rateLimiter.recordRequest();

		if (response.status !== 200) {
			throw new Error(
				`X API error (${response.status}): ${response.text}`
			);
		}

		return {
			tweet: response.json.data as XTweet,
			includes: response.json.includes,
		};
	}

	async fetchBookmarksPage(
		userId: string,
		accessToken: string,
		paginationToken?: string,
		maxResults = 100
	): Promise<XBookmarksResponse> {
		await this.rateLimiter.waitIfNeeded();

		const params = new URLSearchParams({
			max_results: String(Math.min(maxResults, 100)),
			"tweet.fields": BOOKMARKS_TWEET_FIELDS,
			expansions: BOOKMARKS_EXPANSIONS,
			"user.fields": BOOKMARKS_USER_FIELDS,
			"media.fields": BOOKMARKS_MEDIA_FIELDS,
		});

		if (paginationToken) {
			params.set("pagination_token", paginationToken);
		}

		const url = `https://api.x.com/2/users/${userId}/bookmarks?${params.toString()}`;

		this.logger?.debug("Fetching bookmarks page", { paginationToken });

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		this.rateLimiter.recordRequest();

		if (response.status === 429) {
			const resetHeader = response.headers["x-rate-limit-reset"];
			if (resetHeader) {
				const resetMs =
					parseInt(resetHeader) * 1000 - Date.now() + 1000;
				if (resetMs > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, resetMs)
					);
					return this.fetchBookmarksPage(
						userId,
						accessToken,
						paginationToken,
						maxResults
					);
				}
			}
			throw new Error("Rate limited by X API. Please try again later.");
		}

		if (response.status !== 200) {
			throw new Error(
				`X API error (${response.status}): ${response.text}`
			);
		}

		return response.json as XBookmarksResponse;
	}

	async fetchBookmarkFolders(
		userId: string,
		accessToken: string
	): Promise<XBookmarkFoldersResponse> {
		await this.rateLimiter.waitIfNeeded();

		const url = `https://api.x.com/2/users/${userId}/bookmarks/folders`;

		this.logger?.debug("Fetching bookmark folders");

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		this.rateLimiter.recordRequest();

		if (response.status !== 200) {
			throw new Error(
				`X API error fetching folders (${response.status}): ${response.text}`
			);
		}

		return response.json as XBookmarkFoldersResponse;
	}

	async fetchFolderBookmarksPage(
		userId: string,
		folderId: string,
		accessToken: string,
		paginationToken?: string,
		maxResults = 100
	): Promise<XBookmarksResponse> {
		await this.rateLimiter.waitIfNeeded();

		const params = new URLSearchParams({
			max_results: String(Math.min(maxResults, 100)),
			"tweet.fields": BOOKMARKS_TWEET_FIELDS,
			expansions: BOOKMARKS_EXPANSIONS,
			"user.fields": BOOKMARKS_USER_FIELDS,
			"media.fields": BOOKMARKS_MEDIA_FIELDS,
		});

		if (paginationToken) {
			params.set("pagination_token", paginationToken);
		}

		const url = `https://api.x.com/2/users/${userId}/bookmarks/folders/${folderId}/tweets?${params.toString()}`;

		this.logger?.debug("Fetching folder bookmarks", { folderId, paginationToken });

		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		this.rateLimiter.recordRequest();

		if (response.status === 429) {
			const resetHeader = response.headers["x-rate-limit-reset"];
			if (resetHeader) {
				const resetMs =
					parseInt(resetHeader) * 1000 - Date.now() + 1000;
				if (resetMs > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, resetMs)
					);
					return this.fetchFolderBookmarksPage(
						userId,
						folderId,
						accessToken,
						paginationToken,
						maxResults
					);
				}
			}
			throw new Error("Rate limited by X API. Please try again later.");
		}

		if (response.status !== 200) {
			throw new Error(
				`X API error (${response.status}): ${response.text}`
			);
		}

		return response.json as XBookmarksResponse;
	}

	getRateLimiter(): RateLimiter {
		return this.rateLimiter;
	}
}
