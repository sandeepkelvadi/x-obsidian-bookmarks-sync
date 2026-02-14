import type { App } from "obsidian";
import type { XBookmarksSyncSettings } from "../settings";

const TWEET_URL_PATTERN =
	/https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/(\d+)/;

function extractTweetIdFromUrl(url: string): string | null {
	const match = url.match(TWEET_URL_PATTERN);
	return match ? match[2] : null;
}

export class Deduplicator {
	private settings: XBookmarksSyncSettings;
	private app: App;

	constructor(app: App, settings: XBookmarksSyncSettings) {
		this.app = app;
		this.settings = settings;
	}

	isAlreadySynced(tweetId: string): boolean {
		return tweetId in this.settings.syncedTweetIds;
	}

	recordSynced(tweetId: string, filename: string): void {
		this.settings.syncedTweetIds[tweetId] = filename;
	}

	async rebuildIndex(folderPath: string): Promise<number> {
		const newIndex: Record<string, string> = {};
		let count = 0;

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) return 0;

		const files = this.app.vault.getMarkdownFiles().filter(
			(f) => f.path.startsWith(folderPath + "/") || f.path.startsWith(folderPath)
		);

		for (const file of files) {
			try {
				const cache = this.app.metadataCache.getFileCache(file);
				const link = cache?.frontmatter?.link;
				if (link && typeof link === "string") {
					const tweetId = extractTweetIdFromUrl(link);
					if (tweetId) {
						newIndex[tweetId] = file.name;
						count++;
					}
				}
			} catch {
				// Skip files that can't be read
			}
		}

		this.settings.syncedTweetIds = newIndex;
		return count;
	}

	getExistingFilenames(folderPath: string): Set<string> {
		const filenames = new Set<string>();
		const files = this.app.vault.getMarkdownFiles().filter(
			(f) => f.path.startsWith(folderPath + "/") || f.path.startsWith(folderPath)
		);
		for (const file of files) {
			filenames.add(file.name);
		}
		return filenames;
	}
}
