import { Notice, Plugin } from "obsidian";
import {
	XBookmarksSyncSettings,
	DEFAULT_SETTINGS,
	XBookmarksSyncSettingTab,
} from "./settings";
import {
	generatePKCE,
	buildAuthorizationUrl,
	exchangeCodeForToken,
	fetchCurrentUser,
} from "./auth/oauth";
import type { PKCEState } from "./auth/oauth";
import { SyncEngine } from "./sync/sync-engine";
import { SyncStatusModal } from "./ui/sync-status-modal";

export default class XBookmarksSyncPlugin extends Plugin {
	settings: XBookmarksSyncSettings = DEFAULT_SETTINGS;
	private pkceState: PKCEState | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the obsidian:// protocol handler for OAuth callback
		this.registerObsidianProtocolHandler(
			"x-bookmarks-sync",
			async (params) => {
				await this.handleOAuthCallback(params);
			}
		);

		// Ribbon icon
		this.addRibbonIcon(
			"bookmark",
			"Sync X Bookmarks",
			async () => {
				await this.syncBookmarks();
			}
		);

		// Commands
		this.addCommand({
			id: "sync-x-bookmarks",
			name: "Sync X Bookmarks",
			callback: async () => {
				await this.syncBookmarks();
			},
		});

		this.addCommand({
			id: "sync-x-bookmarks-full",
			name: "Full Sync X Bookmarks (re-fetch all)",
			callback: async () => {
				await this.syncBookmarks(true);
			},
		});

		this.addCommand({
			id: "rebuild-sync-index",
			name: "Rebuild X Bookmarks Sync Index",
			callback: async () => {
				await this.rebuildSyncIndex();
			},
		});

		this.addCommand({
			id: "connect-x-account",
			name: "Connect X Account",
			callback: async () => {
				await this.startOAuthFlow();
			},
		});

		// Settings tab
		this.addSettingTab(
			new XBookmarksSyncSettingTab(this.app, this)
		);

		// Auto-sync on startup
		if (this.settings.syncOnStartup && this.settings.accessToken) {
			setTimeout(async () => {
				await this.syncBookmarks();
			}, 2000);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	showNotice(message: string, timeout = 5000): void {
		new Notice(message, timeout);
	}

	async startOAuthFlow(): Promise<void> {
		if (!this.settings.clientId || !this.settings.clientSecret) {
			this.showNotice(
				"Please configure Client ID and Client Secret in settings first."
			);
			return;
		}

		try {
			const { codeVerifier, codeChallenge, state } =
				await generatePKCE();
			this.pkceState = { codeVerifier, state };

			const authUrl = buildAuthorizationUrl(
				this.settings.clientId,
				codeChallenge,
				state
			);

			window.open(authUrl);
			this.showNotice(
				"Opening X authorization page in your browser..."
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showNotice(`OAuth error: ${msg}`);
		}
	}

	private async handleOAuthCallback(
		params: Record<string, string>
	): Promise<void> {
		const { code, state, error } = params;

		if (error) {
			this.showNotice(`X authorization denied: ${error}`);
			return;
		}

		if (!code || !state) {
			this.showNotice("Invalid OAuth callback - missing code or state.");
			return;
		}

		if (!this.pkceState || this.pkceState.state !== state) {
			this.showNotice(
				"OAuth state mismatch. Please try connecting again."
			);
			return;
		}

		try {
			this.showNotice("Exchanging authorization code...");

			const tokenResponse = await exchangeCodeForToken(
				code,
				this.pkceState.codeVerifier,
				this.settings.clientId,
				this.settings.clientSecret
			);

			this.settings.accessToken = tokenResponse.access_token;
			this.settings.refreshToken = tokenResponse.refresh_token;
			this.settings.tokenExpiresAt =
				Date.now() + tokenResponse.expires_in * 1000;

			// Fetch user info
			const userResponse = await fetchCurrentUser(
				this.settings.accessToken
			);
			this.settings.xUserId = userResponse.data.id;
			this.settings.xUsername = userResponse.data.username;

			await this.saveSettings();
			this.pkceState = null;

			this.showNotice(
				`Connected to X as @${this.settings.xUsername}!`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showNotice(`Authentication failed: ${msg}`);
		}
	}

	async syncBookmarks(fullSync = false): Promise<void> {
		if (!this.settings.accessToken) {
			this.showNotice(
				"Not connected to X. Please connect your account in settings."
			);
			return;
		}

		const modal = new SyncStatusModal(this.app);
		modal.open();

		try {
			const engine = new SyncEngine(
				this.app,
				this.settings,
				this.saveSettings.bind(this)
			);

			const result = await engine.sync(modal, fullSync);

			if (result.errors.length > 0) {
				modal.showError(result.errors[0]);
			} else {
				modal.showComplete(result.created, result.skipped);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			modal.showError(msg);
		}
	}

	async rebuildSyncIndex(): Promise<void> {
		try {
			const engine = new SyncEngine(
				this.app,
				this.settings,
				this.saveSettings.bind(this)
			);
			const count = await engine.rebuildIndex();
			await this.saveSettings();
			this.showNotice(
				`Sync index rebuilt: ${count} existing bookmark(s) found.`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showNotice(`Index rebuild failed: ${msg}`);
		}
	}
}
