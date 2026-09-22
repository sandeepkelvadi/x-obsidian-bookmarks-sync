import { requestUrl } from "obsidian";
import type { Logger } from "../utils/logger";
import {
	TYPESAFE_ENDPOINT,
	buildRequestBody,
	interpret,
	NEEDS_REVIEW,
} from "./questions";
import type {
	TriageInput,
	TriageResult,
	SystemOneResponse,
	Taxonomy,
} from "./questions";

/** Returned when Jev could not be asked, or answered badly. */
export function notChecked(): TriageResult {
	return {
		category: NEEDS_REVIEW,
		categoryChoice: "",
		categoryConfidence: 0,
		tags: [],
		tagProbs: {},
		signal: 0,
		titleOk: 1,
		titleNeedsRepair: false,
		checked: false,
	};
}

export interface JevClientOptions {
	apiKey: string;
	/** Which categories and tags Jev may choose from. */
	taxonomy: Taxonomy;
	model?: string;
	minConfidence?: number;
	tagMinProb?: number;
	logger?: Logger;
}

/**
 * Calls TypeSafe System One for one bookmark.
 *
 * Hard rule 4 of the Jev loop: a transport error, a timeout or a malformed
 * body is `not_checked`, never a pass and never a negative. So every failure
 * path here returns NEEDS_REVIEW and lets the note be written regardless.
 */
export class JevClient {
	private apiKey: string;
	private taxonomy: Taxonomy;
	private model?: string;
	private minConfidence?: number;
	private tagMinProb?: number;
	private logger?: Logger;

	constructor(opts: JevClientOptions) {
		this.apiKey = opts.apiKey;
		this.taxonomy = opts.taxonomy;
		this.model = opts.model;
		this.minConfidence = opts.minConfidence;
		this.tagMinProb = opts.tagMinProb;
		this.logger = opts.logger;
	}

	async triage(input: TriageInput): Promise<TriageResult> {
		const body = buildRequestBody(input, this.taxonomy, this.model);

		let raw: unknown;
		try {
			const resp = await requestUrl({
				url: TYPESAFE_ENDPOINT,
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body,
				throw: false,
			});
			if (resp.status < 200 || resp.status >= 300) {
				this.logger?.warn(
					`Jev triage HTTP ${resp.status}: ${String(resp.text).slice(0, 200)}`
				);
				return notChecked();
			}
			raw = resp.json;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger?.warn(`Jev triage request failed: ${msg}`);
			return notChecked();
		}

		if (!this.isValid(raw)) return notChecked();

		try {
			return interpret(raw as SystemOneResponse, this.taxonomy, {
				minConfidence: this.minConfidence,
				tagMinProb: this.tagMinProb,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger?.warn(`Jev response could not be read: ${msg}`);
			return notChecked();
		}
	}

	/**
	 * Hard rule 5: validate the response shape before any policy runs.
	 * This proves the contract, not the correctness of the answers.
	 */
	private isValid(raw: unknown): boolean {
		const r = raw as SystemOneResponse | null;
		if (!r || typeof r !== "object" || !r.answers) {
			this.logger?.warn("Jev response has no answers object");
			return false;
		}
		const cat = r.answers.category;
		if (!cat || cat.type !== "choice") {
			this.logger?.warn("Jev response has no category choice");
			return false;
		}
		if (
			typeof cat.confidence !== "number" ||
			!Number.isFinite(cat.confidence) ||
			cat.confidence < 0 ||
			cat.confidence > 1
		) {
			this.logger?.warn(
				`Jev category confidence is not a probability: ${String(cat.confidence)}`
			);
			return false;
		}
		const keep = r.answers.keep;
		if (
			!keep ||
			keep.type !== "noul" ||
			typeof keep.noul !== "number" ||
			!Number.isFinite(keep.noul)
		) {
			this.logger?.warn("Jev response has no usable keep noul");
			return false;
		}
		return true;
	}
}
