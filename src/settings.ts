import { App, PluginSettingTab, Setting } from "obsidian";
import type XBookmarksSyncPlugin from "./main";

export interface XBookmarksSyncSettings {
	clientId: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: number;
	xUserId: string;
	xUsername: string;

	bookmarksFolderPath: string;
	syncOnStartup: boolean;
	maxBookmarksPerSync: number;
	lastSyncTimestamp: string;

	defaultTags: string;
	enableUrlTypeDetection: boolean;

	syncedTweetIds: Record<string, string>;
}

export const DEFAULT_SETTINGS: XBookmarksSyncSettings = {
	clientId: "",
	clientSecret: "",
	accessToken: "",
	refreshToken: "",
	tokenExpiresAt: 0,
	xUserId: "",
	xUsername: "",

	bookmarksFolderPath: "Bookmarks",
	syncOnStartup: false,
	maxBookmarksPerSync: 0,
	lastSyncTimestamp: "",

	defaultTags: "clippings",
	enableUrlTypeDetection: true,

	syncedTweetIds: {},
};

export class XBookmarksSyncSettingTab extends PluginSettingTab {
	plugin: XBookmarksSyncPlugin;

	constructor(app: App, plugin: XBookmarksSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("x-bookmarks-sync-settings");

		// --- Authentication Section ---
		containerEl.createEl("h2", { text: "Authentication" });

		const authStatus = containerEl.createDiv("auth-status");
		if (this.plugin.settings.accessToken) {
			authStatus.addClass("connected");
			authStatus.setText(
				`Connected as @${this.plugin.settings.xUsername || "unknown"}`
			);
		} else {
			authStatus.addClass("disconnected");
			authStatus.setText("Not connected to X");
		}

		const instructions = containerEl.createDiv("setup-instructions");
		instructions.createEl("strong", { text: "Setup Instructions:" });
		instructions.createEl("br");
		instructions.appendText("1. Go to the ");
		instructions.createEl("a", {
			text: "X Developer Portal",
			href: "https://developer.x.com/en/portal/dashboard",
		});
		instructions.createEl("br");
		instructions.appendText("2. Create a new App (or use an existing one)");
		instructions.createEl("br");
		instructions.appendText('3. Under "User authentication settings", enable OAuth 2.0');
		instructions.createEl("br");
		instructions.appendText('4. Set Type of App to "Native App" or "Single page App"');
		instructions.createEl("br");
		instructions.appendText("5. Add ");
		instructions.createEl("code", { text: "obsidian://x-bookmarks-sync" });
		instructions.appendText(" as a Redirect URI");
		instructions.createEl("br");
		instructions.appendText("6. Copy the Client ID and Client Secret below");

		new Setting(containerEl)
			.setName("Client ID")
			.setDesc("OAuth 2.0 Client ID from X Developer Portal")
			.addText((text) =>
				text
					.setPlaceholder("Enter Client ID")
					.setValue(this.plugin.settings.clientId)
					.onChange(async (value) => {
						this.plugin.settings.clientId = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Client Secret")
			.setDesc("OAuth 2.0 Client Secret from X Developer Portal")
			.addText((text) => {
				text.setPlaceholder("Enter Client Secret")
					.setValue(this.plugin.settings.clientSecret)
					.onChange(async (value) => {
						this.plugin.settings.clientSecret = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		if (this.plugin.settings.accessToken) {
			new Setting(containerEl)
				.setName("Disconnect")
				.setDesc("Remove your X account connection")
				.addButton((btn) =>
					btn
						.setButtonText("Disconnect")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.accessToken = "";
							this.plugin.settings.refreshToken = "";
							this.plugin.settings.tokenExpiresAt = 0;
							this.plugin.settings.xUserId = "";
							this.plugin.settings.xUsername = "";
							await this.plugin.saveSettings();
							this.display();
						})
				);
		} else {
			new Setting(containerEl)
				.setName("Connect to X")
				.setDesc("Authenticate with your X account via OAuth 2.0")
				.addButton((btn) =>
					btn
						.setButtonText("Connect")
						.setCta()
						.onClick(async () => {
							if (
								!this.plugin.settings.clientId ||
								!this.plugin.settings.clientSecret
							) {
								this.plugin.showNotice(
									"Please enter Client ID and Client Secret first"
								);
								return;
							}
							await this.plugin.startOAuthFlow();
						})
				);
		}

		// --- Sync Configuration Section ---
		containerEl.createEl("h2", { text: "Sync Configuration" });

		new Setting(containerEl)
			.setName("Bookmarks folder")
			.setDesc(
				"Vault path where bookmark notes will be created"
			)
			.addText((text) =>
				text
					.setPlaceholder("Bookmarks")
					.setValue(this.plugin.settings.bookmarksFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.bookmarksFolderPath =
							value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync on startup")
			.setDesc("Automatically sync bookmarks when Obsidian opens")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.syncOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max bookmarks per sync")
			.setDesc(
				"Maximum number of bookmarks to fetch per sync (0 = unlimited)"
			)
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(
						String(this.plugin.settings.maxBookmarksPerSync)
					)
					.onChange(async (value) => {
						const num = parseInt(value) || 0;
						this.plugin.settings.maxBookmarksPerSync =
							Math.max(0, num);
						await this.plugin.saveSettings();
					})
			);

		// --- Content Detection Section ---
		containerEl.createEl("h2", { text: "Content Detection" });

		new Setting(containerEl)
			.setName("Default tags")
			.setDesc(
				"Comma-separated tags added to all synced bookmarks"
			)
			.addText((text) =>
				text
					.setPlaceholder("clippings")
					.setValue(this.plugin.settings.defaultTags)
					.onChange(async (value) => {
						this.plugin.settings.defaultTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-detect content type")
			.setDesc(
				"Classify bookmarks as article/video/podcast/code based on URLs in tweets"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.enableUrlTypeDetection
					)
					.onChange(async (value) => {
						this.plugin.settings.enableUrlTypeDetection =
							value;
						await this.plugin.saveSettings();
					})
			);

		// --- Sync Status Section ---
		containerEl.createEl("h2", { text: "Sync Status" });

		const syncedCount = Object.keys(
			this.plugin.settings.syncedTweetIds
		).length;

		new Setting(containerEl)
			.setName("Last sync")
			.setDesc(
				this.plugin.settings.lastSyncTimestamp
					? this.plugin.settings.lastSyncTimestamp
					: "Never"
			);

		new Setting(containerEl)
			.setName("Synced bookmarks")
			.setDesc(`${syncedCount} bookmark(s) in sync index`);

		new Setting(containerEl).setName("Actions").addButton((btn) =>
			btn.setButtonText("Sync Now").setCta().onClick(async () => {
				await this.plugin.syncBookmarks();
			})
		).addButton((btn) =>
			btn.setButtonText("Rebuild Index").onClick(async () => {
				await this.plugin.rebuildSyncIndex();
				this.display();
			})
		);
	}
}
