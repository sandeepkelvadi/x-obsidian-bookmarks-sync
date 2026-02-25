export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

const LOG_PREFIX = "[X-Bookmarks-Sync]";

export class Logger {
	private level: LogLevel;

	constructor(debugEnabled: boolean) {
		this.level = debugEnabled ? LogLevel.DEBUG : LogLevel.INFO;
	}

	setDebug(enabled: boolean): void {
		this.level = enabled ? LogLevel.DEBUG : LogLevel.INFO;
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.level <= LogLevel.DEBUG) {
			console.debug(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.level <= LogLevel.INFO) {
			console.info(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (this.level <= LogLevel.WARN) {
			console.warn(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		console.error(`${LOG_PREFIX} ${message}`, ...args);
	}
}
