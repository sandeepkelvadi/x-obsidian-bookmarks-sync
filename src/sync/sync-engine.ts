import type { App } from "obsidian";
import type { XBookmarksSyncSettings } from "../settings";
import type { XBookmarksResponse, XTweet } from "../api/types";
import { XClient } from "../api/x-client";
import { ensureValidToken } from "../auth/oauth";
import { Deduplicator } from "./deduplicator";
import { transformTweet, noteToMarkdown } from "../transform/tweet-to-note";
import { SyncStatusModal } from "../ui/sync-status-modal";

export interface SyncResult {
	fetched: number;
	created: number;
	skipped: number;
	errors: string[];
}

export class SyncEngine {
	private app: App;
	private settings: XBookmarksSyncSettings;
	private saveSettings: () => Promise<void>;
	private xClient: XClient;
	private deduplicator: Deduplicator;

	constructor(
		app: App,
		settings: XBookmarksSyncSettings,
		saveSettings: () => Promise<void>
	) {
		this.app = app;
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.xClient = new XClient();
		this.deduplicator = new Deduplicator(app, settings);
	}

	async sync(
		modal: SyncStatusModal,
		fullSync = false
	): Promise<SyncResult> {
		const result: SyncResult = {
			fetched: 0,
			created: 0,
			skipped: 0,
			errors: [],
		};

		try {
			// Ensure authentication
			modal.setStatus("Checking authentication...");
			const accessToken = await ensureValidToken(
				this.settings,
				this.saveSettings
			);

			// Ensure bookmarks folder exists
			const folderPath = this.settings.bookmarksFolderPath;
			await this.ensureFolderExists(folderPath);

			// Build index on first run
			if (
				Object.keys(this.settings.syncedTweetIds).length === 0
			) {
				modal.setStatus("Building initial sync index...");
				await this.deduplicator.rebuildIndex(folderPath);
				await this.saveSettings();
			}

			// Get existing filenames for uniqueness check
			const existingFiles =
				this.deduplicator.getExistingFilenames(folderPath);

			// Fetch bookmarks page by page
			let paginationToken: string | undefined;
			let consecutiveExisting = 0;
			let pageNum = 0;

			do {
				if (modal.isCancelled()) {
					modal.setStatus("Sync cancelled.");
					break;
				}

				pageNum++;
				modal.setStatus(
					`Fetching bookmarks page ${pageNum}...`
				);

					// Calculate how many to fetch this page
				const maxPerPage =
					this.settings.maxBookmarksPerSync > 0
						? Math.min(
								100,
								this.settings.maxBookmarksPerSync -
									result.fetched
							)
						: 100;

				if (maxPerPage <= 0) break;

				const response = await this.xClient.fetchBookmarksPage(
					this.settings.xUserId,
					accessToken,
					paginationToken,
					maxPerPage
				);

				if (!response.data || response.data.length === 0) {
					break;
				}

				result.fetched += response.data.length;
				modal.updateProgress(
					result.fetched,
					result.created,
					result.skipped
				);

				// Process each tweet
				for (const tweet of response.data) {
					if (modal.isCancelled()) break;

					if (
						this.deduplicator.isAlreadySynced(tweet.id)
					) {
						result.skipped++;
						consecutiveExisting++;
						modal.updateProgress(
							result.fetched,
							result.created,
							result.skipped
						);

						// Stop if we've hit 3 consecutive existing (incremental sync)
						if (!fullSync && consecutiveExisting >= 3) {
							modal.setStatus(
								"Reached previously synced bookmarks."
							);
							paginationToken = undefined;
							break;
						}
						continue;
					}

					consecutiveExisting = 0;

					try {
						await this.processAndWriteTweet(
							tweet,
							response,
							existingFiles
						);
						result.created++;
						modal.updateProgress(
							result.fetched,
							result.created,
							result.skipped
						);
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						result.errors.push(
							`Tweet ${tweet.id}: ${msg}`
						);
					}
				}

				paginationToken = response.meta?.next_token;

				// Check max bookmarks limit
				if (
					this.settings.maxBookmarksPerSync > 0 &&
					result.fetched >= this.settings.maxBookmarksPerSync
				) {
					break;
				}
			} while (paginationToken);

			// Update last sync timestamp
			this.settings.lastSyncTimestamp = new Date().toISOString();
			await this.saveSettings();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push(msg);
		}

		return result;
	}

	private async processAndWriteTweet(
		tweet: XTweet,
		response: XBookmarksResponse,
		existingFiles: Set<string>
	): Promise<void> {
		const note = transformTweet(
			tweet,
			response.includes,
			this.settings,
			existingFiles
		);

		const markdown = noteToMarkdown(note);
		const filePath = `${this.settings.bookmarksFolderPath}/${note.filename}.md`;

		await this.app.vault.create(filePath, markdown);

		// Track for dedup and filename uniqueness
		this.deduplicator.recordSynced(tweet.id, `${note.filename}.md`);
		existingFiles.add(`${note.filename}.md`);

		// Save after each note for crash safety
		await this.saveSettings();
	}

	private async ensureFolderExists(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			await this.app.vault.createFolder(path);
		}
	}

	async rebuildIndex(): Promise<number> {
		return this.deduplicator.rebuildIndex(
			this.settings.bookmarksFolderPath
		);
	}
}
