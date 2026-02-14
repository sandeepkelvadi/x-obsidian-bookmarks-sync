import type { XEntityUrl, XTweet, XUser } from "../api/types";
import { extractExternalUrls } from "./url-type-detector";

const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|#^[\]]/g;

function sanitizeFilename(name: string): string {
	return name
		.replace(UNSAFE_FILENAME_CHARS, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);
}

function stripMentionsAndUrls(text: string): string {
	return text
		.replace(/https?:\/\/\S+/g, "")
		.replace(/@\w+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function getFirstSentence(text: string): string {
	const cleaned = stripMentionsAndUrls(text);
	const sentenceEnd = cleaned.search(/[.!?\n]/);
	if (sentenceEnd > 0 && sentenceEnd <= 80) {
		return cleaned.slice(0, sentenceEnd).trim();
	}
	// Take first 80 chars at a word boundary
	if (cleaned.length <= 80) {
		return cleaned;
	}
	const truncated = cleaned.slice(0, 80);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > 40) {
		return truncated.slice(0, lastSpace).trim();
	}
	return truncated.trim();
}

export function generateTitle(
	tweet: XTweet,
	author: XUser | undefined,
	urls: XEntityUrl[]
): string {
	const externalUrls = extractExternalUrls(urls);

	// Priority 1: URL card title
	for (const urlEntity of externalUrls) {
		if (urlEntity.title && urlEntity.title.trim().length > 5) {
			return sanitizeFilename(urlEntity.title.trim());
		}
	}

	// Priority 2: First sentence of tweet text
	const fullText = tweet.note_tweet?.text || tweet.text;
	const sentence = getFirstSentence(fullText);
	if (sentence.length > 10) {
		return sanitizeFilename(sentence);
	}

	// Priority 3: Author-based fallback
	const authorName = author?.name || "Unknown";
	return sanitizeFilename(`${authorName} tweet ${tweet.id.slice(-6)}`);
}

export function ensureUniqueFilename(
	desiredName: string,
	existingFiles: Set<string>
): string {
	if (!existingFiles.has(desiredName + ".md")) {
		return desiredName;
	}

	let counter = 2;
	while (existingFiles.has(`${desiredName} (${counter}).md`)) {
		counter++;
	}
	return `${desiredName} (${counter})`;
}
