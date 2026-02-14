import type { XEntityUrl } from "../api/types";

interface UrlTypeResult {
	type: string;
	extractedUrl: string;
}

interface UrlTypeRule {
	pattern: RegExp;
	type: string;
}

const URL_TYPE_RULES: UrlTypeRule[] = [
	// Video
	{ pattern: /youtube\.com|youtu\.be/i, type: "video" },
	{ pattern: /vimeo\.com/i, type: "video" },
	{ pattern: /twitch\.tv/i, type: "video" },
	{ pattern: /loom\.com/i, type: "video" },

	// Podcast
	{ pattern: /open\.spotify\.com\/episode/i, type: "podcast" },
	{ pattern: /podcasts\.apple\.com/i, type: "podcast" },
	{ pattern: /overcast\.fm/i, type: "podcast" },

	// Code
	{ pattern: /github\.com/i, type: "code" },
	{ pattern: /gitlab\.com/i, type: "code" },
	{ pattern: /codepen\.io/i, type: "code" },
	{ pattern: /replit\.com/i, type: "code" },
	{ pattern: /npmjs\.com/i, type: "code" },

	// Newsletter
	{ pattern: /substack\.com/i, type: "newsletter" },
	{ pattern: /beehiiv\.com/i, type: "newsletter" },
	{ pattern: /buttondown\.email/i, type: "newsletter" },

	// Article (known platforms)
	{ pattern: /medium\.com/i, type: "article" },
	{ pattern: /dev\.to/i, type: "article" },
	{ pattern: /techcrunch\.com/i, type: "article" },
	{ pattern: /theverge\.com/i, type: "article" },
	{ pattern: /arxiv\.org/i, type: "article" },
	{ pattern: /reddit\.com/i, type: "article" },
	{ pattern: /hackernews|news\.ycombinator/i, type: "article" },
	{ pattern: /wikipedia\.org/i, type: "article" },
];

const ARTICLE_PATH_PATTERNS = [
	/\/blog\//i,
	/\/post\//i,
	/\/posts\//i,
	/\/article\//i,
	/\/articles\//i,
	/\/news\//i,
	/\/engineering\//i,
	/\/research\//i,
];

function isXUrl(url: string): boolean {
	return /^https?:\/\/(x\.com|twitter\.com)/i.test(url);
}

export function detectContentType(
	urls: XEntityUrl[],
	enableDetection: boolean
): UrlTypeResult {
	const defaultResult: UrlTypeResult = {
		type: "tweet",
		extractedUrl: "",
	};

	if (!enableDetection || !urls || urls.length === 0) {
		return defaultResult;
	}

	// Filter out X.com self-referencing URLs
	const externalUrls = urls.filter((u) => {
		const resolved = u.unwound_url || u.expanded_url;
		return resolved && !isXUrl(resolved);
	});

	if (externalUrls.length === 0) {
		return defaultResult;
	}

	// Check each external URL against rules
	for (const urlEntity of externalUrls) {
		const resolved = urlEntity.unwound_url || urlEntity.expanded_url;

		for (const rule of URL_TYPE_RULES) {
			if (rule.pattern.test(resolved)) {
				return {
					type: rule.type,
					extractedUrl: resolved,
				};
			}
		}

		// Check path-based article patterns
		for (const pathPattern of ARTICLE_PATH_PATTERNS) {
			if (pathPattern.test(resolved)) {
				return {
					type: "article",
					extractedUrl: resolved,
				};
			}
		}
	}

	// If there are external URLs but no pattern match, default to article
	const firstExternal = externalUrls[0];
	const resolved = firstExternal.unwound_url || firstExternal.expanded_url;
	if (resolved) {
		return {
			type: "article",
			extractedUrl: resolved,
		};
	}

	return defaultResult;
}

export function extractExternalUrls(urls: XEntityUrl[]): XEntityUrl[] {
	if (!urls) return [];
	return urls.filter((u) => {
		const resolved = u.unwound_url || u.expanded_url;
		return resolved && !isXUrl(resolved);
	});
}
