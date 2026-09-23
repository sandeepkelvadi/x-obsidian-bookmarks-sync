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

	/**
	 * Rebuild the synced-id index by scanning the notes on disk.
	 *
	 * Read `source:` first. It is the tweet permalink on every note. `link:`
	 * is the URL the tweet shared, so on a note that links out to YouTube or
	 * GitHub it carries no tweet id at all — reading it alone silently drops
	 * those notes from the index, and the next sync saves them again as
	 * duplicates. `link:` stays as a fallback for notes that have no
	 * `source:`, and for older notes written before the field existed.
	 *
	 * The result is merged into the existing index, never swapped for it. A
	 * note whose frontmatter was edited by hand can yield no id at all, and
	 * dropping that id costs a duplicate note, while keeping a stale id costs
	 * nothing. Returns the number of notes the scan indexed.
	 */
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
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (!fm) continue;
				let tweetId: string | null = null;
				for (const field of ["source", "link"]) {
					const value = fm[field];
					if (value && typeof value === "string") {
						tweetId = extractTweetIdFromUrl(value);
						if (tweetId) break;
					}
				}
				if (tweetId && !(tweetId in newIndex)) {
					newIndex[tweetId] = file.name;
					count++;
				}
			} catch {
				// Skip files that can't be read
			}
		}

		// Merge rather than replace. A note whose frontmatter was edited by
		// hand, or whose id cannot be recovered from either field, would
		// otherwise fall out of the index and be re-downloaded.
		const merged: Record<string, string> = {
			...this.settings.syncedTweetIds,
			...newIndex,
		};
		this.settings.syncedTweetIds = merged;
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
