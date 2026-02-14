import { Modal, App } from "obsidian";

export class SyncStatusModal extends Modal {
	private statusEl: HTMLElement;
	private fetchedEl: HTMLElement;
	private createdEl: HTMLElement;
	private skippedEl: HTMLElement;
	private currentStatusEl: HTMLElement;
	private cancelled = false;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sync-status-modal");

		contentEl.createEl("h2", { text: "Syncing X Bookmarks" });

		const progressDiv = contentEl.createDiv("sync-progress");

		const fetchedRow = progressDiv.createDiv("sync-stat");
		fetchedRow.createSpan({ text: "Fetched:", cls: "sync-stat-label" });
		this.fetchedEl = fetchedRow.createSpan({
			text: "0",
			cls: "sync-stat-value",
		});

		const createdRow = progressDiv.createDiv("sync-stat");
		createdRow.createSpan({
			text: "New notes created:",
			cls: "sync-stat-label",
		});
		this.createdEl = createdRow.createSpan({
			text: "0",
			cls: "sync-stat-value",
		});

		const skippedRow = progressDiv.createDiv("sync-stat");
		skippedRow.createSpan({
			text: "Skipped (duplicates):",
			cls: "sync-stat-label",
		});
		this.skippedEl = skippedRow.createSpan({
			text: "0",
			cls: "sync-stat-value",
		});

		this.currentStatusEl = progressDiv.createDiv("sync-current-status");
		this.currentStatusEl.setText("Starting...");

		this.statusEl = progressDiv.createDiv();

		const buttonRow = contentEl.createDiv({
			attr: { style: "text-align: right; margin-top: 12px;" },
		});
		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.cancelled = true;
			this.currentStatusEl.setText("Cancelling...");
		});
	}

	updateProgress(fetched: number, created: number, skipped: number): void {
		this.fetchedEl.setText(String(fetched));
		this.createdEl.setText(String(created));
		this.skippedEl.setText(String(skipped));
	}

	setStatus(status: string): void {
		this.currentStatusEl.setText(status);
	}

	showComplete(created: number, skipped: number): void {
		this.currentStatusEl.setText(
			`Sync complete! Created ${created} note(s), skipped ${skipped} duplicate(s).`
		);
		this.currentStatusEl.style.fontStyle = "normal";
		this.currentStatusEl.style.color = "var(--text-success)";
	}

	showError(message: string): void {
		this.currentStatusEl.setText(`Error: ${message}`);
		this.currentStatusEl.style.color = "var(--text-error)";
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
