import type { App } from "obsidian";
import type { XBookmarksSyncSettings } from "../settings";
import type { XBookmarksResponse, XTweet } from "../api/types";
import { XClient } from "../api/x-client";
import { ensureValidToken } from "../auth/oauth";
import { Deduplicator } from "./deduplicator";
import { RepliesReviewer } from "./replies-reviewer";
import { transformTweet, noteToMarkdown } from "../transform/tweet-to-note";
import { SyncStatusModal } from "../ui/sync-status-modal";
import type { Logger } from "../utils/logger";

export interface SyncResult {
	fetched: number;
	created: number;
	skipped: number;
	reviewed: number;
	errors: string[];
}

export class SyncEngine {
	private app: App;
	private settings: XBookmarksSyncSettings;
	private saveSettings: () => Promise<void>;
	private xClient: XClient;
	private deduplicator: Deduplicator;
	private repliesReviewer: RepliesReviewer | null = null;
	private logger?: Logger;

	constructor(
		app: App,
		settings: XBookmarksSyncSettings,
		saveSettings: () => Promise<void>,
		logger?: Logger
	) {
		this.app = app;
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.xClient = new XClient(logger);
		this.deduplicator = new Deduplicator(app, settings);
		this.logger = logger;

		if (settings.enableRepliesReview && settings.grokApiKey) {
			this.repliesReviewer = new RepliesReviewer(settings, logger);
			this.logger?.info("Replies review enabled");
		}
	}

	async sync(
		modal: SyncStatusModal,
		fullSync = false
	): Promise<SyncResult> {
		const result: SyncResult = {
			fetched: 0,
			created: 0,
			skipped: 0,
			reviewed: 0,
			errors: [],
		};

		this.logger?.info(
			`Starting ${fullSync ? "full" : "incremental"} sync`
		);

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

			// Build folder→tweet mapping if folder tags enabled
			const tweetFolderMap = new Map<string, string[]>();
			if (this.settings.enableFolderTags) {
				modal.setStatus("Fetching bookmark folders...");
				await this.buildFolderMap(
					accessToken,
					tweetFolderMap
				);
				this.logger?.info(
					`Folder map built: ${tweetFolderMap.size} tweets mapped to folders`
				);
			}

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
					result.skipped,
					result.reviewed
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
						const folderNames = tweetFolderMap.get(tweet.id) || [];
						const reviewed = await this.processAndWriteTweet(
							tweet,
							response,
							existingFiles,
							accessToken,
							folderNames
						);
						result.created++;
						if (reviewed) result.reviewed++;
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

			this.logger?.info(
				`Sync complete: ${result.created} created, ${result.skipped} skipped, ${result.reviewed} reviewed`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push(msg);
		}

		return result;
	}

	private async processAndWriteTweet(
		tweet: XTweet,
		response: XBookmarksResponse,
		existingFiles: Set<string>,
		accessToken: string,
		folderNames: string[] = []
	): Promise<boolean> {
		const note = transformTweet(
			tweet,
			response.includes,
			this.settings,
			existingFiles,
			folderNames
		);

		// Enrich with replies review if enabled
		let reviewed = false;
		if (this.repliesReviewer) {
			try {
				const reviewResult =
					await this.repliesReviewer.reviewTweet(
						tweet,
						response.includes,
						accessToken
					);
				if (reviewResult.hasContent) {
					note.body += "\n\n" + reviewResult.discussionSummary;
					reviewed = true;
				}
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : String(err);
				this.logger?.warn(
					`Reply review failed for ${tweet.id}: ${msg}`
				);
			}
		}

		const markdown = noteToMarkdown(note);
		const filePath = `${this.settings.bookmarksFolderPath}/${note.filename}.md`;

		await this.app.vault.create(filePath, markdown);

		// Track for dedup and filename uniqueness
		this.deduplicator.recordSynced(tweet.id, `${note.filename}.md`);
		existingFiles.add(`${note.filename}.md`);

		// Save after each note for crash safety
		await this.saveSettings();

		return reviewed;
	}

	private async buildFolderMap(
		accessToken: string,
		tweetFolderMap: Map<string, string[]>
	): Promise<void> {
		try {
			// Fetch folder list
			const foldersResponse = await this.xClient.fetchBookmarkFolders(
				this.settings.xUserId,
				accessToken
			);

			if (!foldersResponse.data || foldersResponse.data.length === 0) {
				this.logger?.info("No bookmark folders found");
				return;
			}

			// Cache folder names in settings
			this.settings.cachedFolders = {};
			for (const folder of foldersResponse.data) {
				this.settings.cachedFolders[folder.id] = folder.name;
			}
			await this.saveSettings();

			const prefix = this.settings.folderTagPrefix || "";

			// For each folder, fetch its tweet IDs
			for (const folder of foldersResponse.data) {
				let paginationToken: string | undefined;
				const tagName = prefix + folder.name;

				this.logger?.debug(
					`Fetching tweets for folder "${folder.name}" (${folder.id})`
				);

				do {
					try {
						const page =
							await this.xClient.fetchFolderBookmarksPage(
								this.settings.xUserId,
								folder.id,
								accessToken,
								paginationToken
							);

						if (page.data) {
							for (const tweet of page.data) {
								const existing =
									tweetFolderMap.get(tweet.id) || [];
								existing.push(tagName);
								tweetFolderMap.set(tweet.id, existing);
							}
						}

						paginationToken = page.meta?.next_token;
					} catch (err) {
						const msg =
							err instanceof Error
								? err.message
								: String(err);
						this.logger?.warn(
							`Failed to fetch bookmarks for folder "${folder.name}": ${msg}`
						);
						break;
					}
				} while (paginationToken);
			}
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : String(err);
			this.logger?.warn(`Failed to fetch bookmark folders: ${msg}`);
		}
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
