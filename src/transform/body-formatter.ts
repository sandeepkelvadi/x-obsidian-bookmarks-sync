import type { XTweet, XUser, XMedia, XEntityUrl, XBookmarksResponse } from "../api/types";

function formatDate(isoDate: string | undefined): string {
	if (!isoDate) return "";
	return isoDate.slice(0, 10);
}

function replaceUrls(text: string, urls: XEntityUrl[] | undefined): string {
	if (!urls || urls.length === 0) return text;

	let result = text;
	// Sort URLs by start position descending to replace from end to start
	const sortedUrls = [...urls].sort((a, b) => b.start - a.start);

	for (const urlEntity of sortedUrls) {
		const expanded = urlEntity.expanded_url || urlEntity.display_url;
		// Replace t.co URLs with expanded URLs
		result = result.replace(urlEntity.url, expanded);
	}

	return result;
}

function findUser(
	userId: string,
	includes: XBookmarksResponse["includes"]
): XUser | undefined {
	return includes?.users?.find((u) => u.id === userId);
}

function findMedia(
	mediaKeys: string[] | undefined,
	includes: XBookmarksResponse["includes"]
): XMedia[] {
	if (!mediaKeys || !includes?.media) return [];
	return mediaKeys
		.map((key) => includes.media!.find((m) => m.media_key === key))
		.filter((m): m is XMedia => m !== undefined);
}

function formatMediaMarkdown(media: XMedia[]): string {
	if (media.length === 0) return "";

	return media
		.map((m) => {
			if (m.type === "photo" && m.url) {
				return `![Image](${m.url})`;
			}
			if (
				(m.type === "video" || m.type === "animated_gif") &&
				m.preview_image_url
			) {
				return `![Video thumbnail](${m.preview_image_url})`;
			}
			return "";
		})
		.filter((s) => s.length > 0)
		.join("\n\n");
}

function formatSingleTweet(
	tweet: XTweet,
	author: XUser | undefined,
	media: XMedia[]
): string {
	const authorName = author?.name || "Unknown";
	const username = author?.username || "unknown";
	const date = formatDate(tweet.created_at);
	const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;

	const entities = tweet.note_tweet?.entities || tweet.entities;
	const rawText = tweet.note_tweet?.text || tweet.text;
	const text = replaceUrls(rawText, entities?.urls);

	const parts: string[] = [];
	parts.push(`**${authorName}** @${username} [${date}](${tweetUrl})`);
	parts.push("");
	parts.push(text);

	const mediaMarkdown = formatMediaMarkdown(media);
	if (mediaMarkdown) {
		parts.push("");
		parts.push(mediaMarkdown);
	}

	return parts.join("\n");
}

export function formatTweetBody(
	tweet: XTweet,
	includes: XBookmarksResponse["includes"]
): string {
	const author = findUser(tweet.author_id, includes);
	const media = findMedia(tweet.attachments?.media_keys, includes);

	const sections: string[] = [];

	// Main tweet
	sections.push(formatSingleTweet(tweet, author, media));

	// Quoted tweet
	if (tweet.referenced_tweets) {
		for (const ref of tweet.referenced_tweets) {
			if (ref.type === "quoted" && includes?.tweets) {
				const quotedTweet = includes.tweets.find(
					(t) => t.id === ref.id
				);
				if (quotedTweet) {
					const quotedAuthor = findUser(
						quotedTweet.author_id,
						includes
					);
					const quotedMedia = findMedia(
						quotedTweet.attachments?.media_keys,
						includes
					);
					const quotedBody = formatSingleTweet(
						quotedTweet,
						quotedAuthor,
						quotedMedia
					);
					// Format as blockquote
					const blockquoted = quotedBody
						.split("\n")
						.map((line) => `> ${line}`)
						.join("\n");
					sections.push("");
					sections.push(blockquoted);
				}
			}
		}
	}

	return sections.join("\n");
}

export function findAuthor(
	tweet: XTweet,
	includes: XBookmarksResponse["includes"]
): XUser | undefined {
	return findUser(tweet.author_id, includes);
}
