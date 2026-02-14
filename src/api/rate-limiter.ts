export class RateLimiter {
	private requestTimestamps: number[] = [];
	private readonly maxRequests: number;
	private readonly windowMs: number;

	constructor(maxRequests = 180, windowMs = 15 * 60 * 1000) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
	}

	private pruneOldRequests(): void {
		const cutoff = Date.now() - this.windowMs;
		this.requestTimestamps = this.requestTimestamps.filter(
			(ts) => ts > cutoff
		);
	}

	canMakeRequest(): boolean {
		this.pruneOldRequests();
		return this.requestTimestamps.length < this.maxRequests;
	}

	recordRequest(): void {
		this.requestTimestamps.push(Date.now());
	}

	getWaitTimeMs(): number {
		this.pruneOldRequests();
		if (this.requestTimestamps.length < this.maxRequests) {
			return 0;
		}
		const oldest = this.requestTimestamps[0];
		return oldest + this.windowMs - Date.now() + 100;
	}

	async waitIfNeeded(): Promise<void> {
		const waitTime = this.getWaitTimeMs();
		if (waitTime > 0) {
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
	}
}
