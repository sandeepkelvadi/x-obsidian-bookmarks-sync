import type {
	XTweet,
	XBookmarksResponse,
	BookmarkNote,
	XEntityUrl,
} from "../api/types";
import type { XBookmarksSyncSettings } from "../settings";
import { detectContentType } from "./url-type-detector";
import { generateTitle, ensureUniqueFilename } from "./title-generator";
import { formatTweetBody, findAuthor } from "./body-formatter";

function escapeYaml(value: string): string {
	if (!value) return "";
	if (/[:#\[\]{}|>&*!,'"?@`]/.test(value) || value.startsWith("-") || value.startsWith(" ")) {
		// Escape internal double quotes and wrap
		return `"${value.replace(/"/g, '\\"')}"`;
	}
	return value;
}

function formatDate(isoDate: string | undefined): string {
	if (!isoDate) return "";
	return isoDate.slice(0, 10);
}

function extractDescription(tweet: XTweet): string {
	const fullText = tweet.note_tweet?.text || tweet.text;
	// Strip URLs and @mentions for clean description
	const cleaned = fullText
		.replace(/https?:\/\/\S+/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (cleaned.length <= 200) return cleaned;
	const truncated = cleaned.slice(0, 200);
	const lastSpace = truncated.lastIndexOf(" ");
	return (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated).trim();
}

function extractHashtags(tweet: XTweet): string[] {
	const entities = tweet.note_tweet?.entities || tweet.entities;
	if (!entities?.hashtags) return [];
	return entities.hashtags.map((h) => h.tag);
}

function getAllUrls(tweet: XTweet): XEntityUrl[] {
	const noteUrls = tweet.note_tweet?.entities?.urls || [];
	const regularUrls = tweet.entities?.urls || [];
	// Combine and deduplicate by expanded_url
	const seen = new Set<string>();
	const combined: XEntityUrl[] = [];
	for (const u of [...noteUrls, ...regularUrls]) {
		const key = u.expanded_url || u.url;
		if (!seen.has(key)) {
			seen.add(key);
			combined.push(u);
		}
	}
	return combined;
}

export function transformTweet(
	tweet: XTweet,
	includes: XBookmarksResponse["includes"],
	settings: XBookmarksSyncSettings,
	existingFiles: Set<string>
): BookmarkNote {
	const author = findAuthor(tweet, includes);
	const urls = getAllUrls(tweet);

	// Detect content type from URLs
	const { type, extractedUrl } = detectContentType(
		urls,
		settings.enableUrlTypeDetection
	);

	// source = the tweet permalink (where the bookmark came from)
	const tweetUrl = `https://x.com/${author?.username || "i"}/status/${tweet.id}`;

	// link = the external URL the tweet is sharing (falls back to tweet URL)
	const link = extractedUrl || tweetUrl;

	// Generate title
	const rawTitle = generateTitle(tweet, author, urls);
	const filename = ensureUniqueFilename(rawTitle, existingFiles);

	// Extract tags
	const defaultTags = settings.defaultTags
		.split(",")
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
	const hashtags = extractHashtags(tweet);
	const tags = [...new Set([...defaultTags, ...hashtags])];

	// Format body
	const body = formatTweetBody(tweet, includes);

	return {
		title: rawTitle,
		source: tweetUrl,
		author: author ? [author.name] : [],
		published_date: formatDate(tweet.created_at),
		created: new Date().toISOString().slice(0, 10),
		description: extractDescription(tweet),
		tags,
		type: [type],
		link,
		category: [],
		related_to: "",
		filename,
		body,
		tweetId: tweet.id,
	};
}

export function noteToMarkdown(note: BookmarkNote): string {
	const lines: string[] = ["---"];

	lines.push(`type:`);
	for (const t of note.type) {
		lines.push(`  - ${t}`);
	}

	lines.push(`title: ${escapeYaml(note.title)}`);
	lines.push(`link: ${note.link}`);
	lines.push(`source: ${note.source}`);

	lines.push(`author:`);
	if (note.author.length > 0) {
		for (const a of note.author) {
			lines.push(`  - ${escapeYaml(a)}`);
		}
	}

	lines.push(`description: ${escapeYaml(note.description)}`);
	lines.push(`related_to:`);

	lines.push(`category:`);
	if (note.category.length > 0) {
		for (const c of note.category) {
			lines.push(`  - ${c}`);
		}
	}

	lines.push(`tags:`);
	if (note.tags.length > 0) {
		for (const t of note.tags) {
			lines.push(`  - ${t}`);
		}
	}

	lines.push(`created: ${note.created}`);
	if (note.published_date) {
		lines.push(`published_date: ${note.published_date}`);
	}

	lines.push("---");
	lines.push("");
	lines.push(note.body);
	lines.push("");

	return lines.join("\n");
}
