/**
 * Jev (TypeSafe System One) judgments for bookmark triage.
 *
 * Pure module: no Obsidian imports, no Node imports, no I/O. Shared by the
 * plugin's note-creation path and by any offline backfill tool.
 *
 * The taxonomy — which categories exist and which tags may be applied — is
 * NOT baked in here. Every filing system is personal, so the caller supplies
 * one. The plugin reads it from its settings; a script can read it from a
 * file. `DEFAULT_CATEGORIES_TEXT` and `DEFAULT_TAGS_TEXT` are only a neutral
 * starting point for a new user to edit.
 *
 * Designed against the live docs at https://docs.typesafe.ai:
 *   /api.md, /primitives/choice.md, /primitives/noul.md, /confidence.md
 */

export const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const TYPESAFE_MODEL = "jev-latest";

/** Sentinel written to `category:` when the Choice is below threshold. */
export const NEEDS_REVIEW = "needs-review";

/** The key Jev picks when nothing fits. Always present; added if absent. */
export const OTHER_KEY = "other";

export interface Category {
	/** What gets written to `category:`. */
	label: string;
	/** What belongs in this category, in the user's own words. */
	rubric: string;
}

export interface Taxonomy {
	/** Jev's choice key -> category. Keys carry no meaning to the model. */
	categories: Record<string, Category>;
	/** Tag -> what the tag means. One Noul runs per tag. */
	tags: Record<string, string>;
}

/**
 * A neutral starting point. One category per line, `Label: what goes here`.
 * Users are expected to replace these with their own filing system.
 */
export const DEFAULT_CATEGORIES_TEXT = [
	"Reading: Long-form articles, essays and newsletters meant to be read end to end",
	"Tools: A specific app, library, CLI, service or repository, where the tool itself is the point",
	"Reference: Documentation, how-tos and guides you would come back to to look something up",
	"News: Announcements, releases and industry news that matter mostly right now",
	"Ideas: Opinions, arguments and concepts worth re-reading and thinking about",
	"Other: None of the above fits well",
].join("\n");

/** A neutral starting point. One tag per line, `tag: what it means`. */
export const DEFAULT_TAGS_TEXT = [
	"tutorial: A step-by-step how-to or guide",
	"open-source: An open-source project or repository",
	"research: A paper, study, benchmark or original research",
	"opinion: An argument or point of view rather than a report",
	"data: Contains a dataset, numbers or original measurements",
	"video: The main content is a video or talk",
].join("\n");

/**
 * Turn a category label into a stable choice key: lowercase, runs of
 * non-alphanumerics collapsed to `_`. "AI Marketing" -> "ai_marketing".
 */
export function labelToKey(label: string): string {
	const key = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return key || "unnamed";
}

/** Split `key: value` lines. Blank lines and `#` comments are skipped. */
function parseLines(text: string): { key: string; value: string }[] {
	const out: { key: string; value: string }[] = [];
	for (const raw of (text || "").split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const at = line.indexOf(":");
		if (at < 1) continue;
		const key = line.slice(0, at).trim();
		const value = line.slice(at + 1).trim();
		if (key && value) out.push({ key, value });
	}
	return out;
}

/**
 * Parse the categories setting. Always ends with an exit option, because a
 * Choice set with no way out forces a wrong answer when nothing fits.
 */
export function parseCategories(text: string): Record<string, Category> {
	const categories: Record<string, Category> = {};
	for (const { key: label, value: rubric } of parseLines(text)) {
		const key = labelToKey(label);
		if (!categories[key]) categories[key] = { label, rubric };
	}
	if (!categories[OTHER_KEY]) {
		categories[OTHER_KEY] = {
			label: "Other",
			rubric: "None of the above fits well",
		};
	}
	return categories;
}

/** Parse the tags setting. An empty setting means no tag questions run. */
export function parseTags(text: string): Record<string, string> {
	const tags: Record<string, string> = {};
	for (const { key, value } of parseLines(text)) {
		if (!tags[key]) tags[key] = value;
	}
	return tags;
}

/** Build a taxonomy from the two settings strings. */
export function parseTaxonomy(categoriesText: string, tagsText: string): Taxonomy {
	return {
		categories: parseCategories(categoriesText),
		tags: parseTags(tagsText),
	};
}

/** The starting taxonomy, for a user who has changed nothing. */
export function defaultTaxonomy(): Taxonomy {
	return parseTaxonomy(DEFAULT_CATEGORIES_TEXT, DEFAULT_TAGS_TEXT);
}

export const MAX_TAGS = 4;

/**
 * Thresholds. Starting values only. They are uncalibrated until measured on
 * real notes, so tune them from a dry run rather than trusting these.
 *   CATEGORY_MIN_CONFIDENCE: Choice `confidence` below this -> needs-review.
 *   TAG_MIN_PROB: Noul probability a tag needs to be written.
 */
export const CATEGORY_MIN_CONFIDENCE = 0.5;
export const TAG_MIN_PROB = 0.7;

/**
 * Title-quality Noul threshold. `title_ok` below this means the title does
 * not describe its bookmark, so the row is a candidate for a rewrite by a
 * writing model. Phrased so high = good title.
 */
export const TITLE_OK_MIN_PROB = 0.5;

export interface TriageInput {
	title: string;
	description: string;
	url: string;
	author: string;
	type: string;
	body: string;
}

/** Max body characters sent as state. */
export const MAX_BODY_CHARS = 3000;

export function buildState(input: TriageInput): Record<string, string> {
	const body =
		input.body.length > MAX_BODY_CHARS
			? input.body.slice(0, MAX_BODY_CHARS) + "\n[truncated]"
			: input.body;
	return {
		title: input.title,
		description: input.description,
		url: input.url,
		author: input.author,
		type: input.type,
		body,
	};
}

/** The TypeSafe `questions` map for one taxonomy. Same object every request. */
export function buildQuestions(tax: Taxonomy): Record<string, unknown> {
	const criteria: Record<string, string> = {};
	for (const key of Object.keys(tax.categories)) {
		criteria[key] = tax.categories[key].rubric;
	}

	const questions: Record<string, unknown> = {
		category: {
			type: "choice",
			instructions: {
				question:
					"Which category best describes what this bookmarked post is about, judged from `title`, `description`, `url` and `body`?",
				note: `Pick the single best fit. Pick \`${OTHER_KEY}\` only when none of the categories describe the main subject.`,
			},
			criteria,
		},
		keep: {
			type: "noul",
			instructions:
				"Would the owner of this bookmark library plausibly come back to this bookmark later as a reference?",
			criteria: {
				true: "Contains something reusable: a tool, repo, guide, workflow, prompt, dataset, or a well-argued idea worth re-reading",
				false: "One-off news, a hot take, hype, a joke, an announcement with no lasting reference value, or too thin to be useful",
			},
		},
		title_ok: {
			type: "noul",
			instructions: {
				question:
					"Does `title` describe what this bookmark is actually about, well enough that someone scanning a list of titles a year from now would know whether to open it?",
				judge: "Judge the `title` field on its own. `body`, `description` and `url` are here only so you can tell what the bookmark is about; do not let them fill in what the title leaves out. The question is whether the title alone carries the subject.",
			},
			criteria: {
				true: "The title names its subject — a tool, person, company, technique, product or claim. A short title passes as long as it is genuinely descriptive.",
				false: {
					bare_id: "A placeholder built from an author and a number, such as 'Some Author tweet 959567'.",
					bare_domain: "Just a domain or product name with nothing said about it, such as 'example.com'.",
					truncated: "A sentence cut off mid-phrase, so the point never arrives, such as '3 is really required'.",
					opener: "The opening words of a social post that never name the subject, such as 'Introducing frame'.",
				},
			},
		},
	};

	for (const tag of Object.keys(tax.tags)) {
		questions[`tag:${tag}`] = {
			type: "noul",
			instructions: `Is this bookmarked post substantially about: ${tax.tags[tag]}?`,
			criteria: {
				true: "The topic is a main subject of the post, not a passing mention",
				false: "The topic is absent, or only mentioned in passing",
			},
		};
	}
	return questions;
}

export interface ChoiceAnswer {
	type: "choice";
	choice: string;
	probabilities: Record<string, number>;
	confidence: number;
}
export interface NoulAnswer {
	type: "noul";
	noul: number;
}
export interface SystemOneResponse {
	model: string;
	answers: Record<string, ChoiceAnswer | NoulAnswer>;
	usage: { input_tokens: number; output_tokens: number };
}

export interface TriageResult {
	/** Label to write to `category:` (a taxonomy label or NEEDS_REVIEW). */
	category: string;
	/** Jev's raw pick, before thresholding. */
	categoryChoice: string;
	categoryConfidence: number;
	/** Tags above threshold, best first, capped at MAX_TAGS. */
	tags: string[];
	/** Every tag's probability, for tuning. */
	tagProbs: Record<string, number>;
	/** Keep-worthiness probability, 0..1. */
	signal: number;
	/** Title-quality probability, 0..1. High = the title describes the bookmark. */
	titleOk: number;
	/** True when titleOk is below threshold, so the title is worth rewriting. */
	titleNeedsRepair: boolean;
	/**
	 * False when Jev was never successfully asked (transport error, bad body).
	 * A not-checked result carries no judgment at all — its `signal` of 0 is a
	 * placeholder, not a low score, so do not write it.
	 */
	checked?: boolean;
}

/** Turn a raw API response into the values the note gets. Pure policy. */
export function interpret(
	response: SystemOneResponse,
	tax: Taxonomy,
	opts: { minConfidence?: number; tagMinProb?: number; titleOkMinProb?: number } = {}
): TriageResult {
	const minConfidence = opts.minConfidence ?? CATEGORY_MIN_CONFIDENCE;
	const tagMinProb = opts.tagMinProb ?? TAG_MIN_PROB;
	const titleOkMin = opts.titleOkMinProb ?? TITLE_OK_MIN_PROB;

	const cat = response.answers.category as ChoiceAnswer;
	const keep = response.answers.keep as NoulAnswer;
	const titleOkAns = response.answers.title_ok as NoulAnswer | undefined;
	const titleOk = titleOkAns ? titleOkAns.noul : 1;

	const tagProbs: Record<string, number> = {};
	for (const tag of Object.keys(tax.tags)) {
		const a = response.answers[`tag:${tag}`] as NoulAnswer | undefined;
		tagProbs[tag] = a ? a.noul : 0;
	}
	const tags = Object.keys(tagProbs)
		.filter((t) => tagProbs[t] >= tagMinProb)
		.sort((a, b) => tagProbs[b] - tagProbs[a])
		.slice(0, MAX_TAGS);

	const confident = cat.confidence >= minConfidence;
	const label = tax.categories[cat.choice]?.label ?? NEEDS_REVIEW;

	return {
		category: confident ? label : NEEDS_REVIEW,
		categoryChoice: cat.choice,
		categoryConfidence: cat.confidence,
		tags,
		tagProbs,
		signal: Math.round(keep.noul * 100) / 100,
		titleOk: Math.round(titleOk * 100) / 100,
		titleNeedsRepair: titleOk < titleOkMin,
	};
}

/**
 * Body of the POST. The caller adds the Authorization header.
 *
 * Pin `model` for any run you intend to compare against another: results from
 * two different model versions are not comparable.
 */
export function buildRequestBody(
	input: TriageInput,
	tax: Taxonomy,
	model?: string
): string {
	return JSON.stringify({
		model: model || TYPESAFE_MODEL,
		state: buildState(input),
		questions: buildQuestions(tax),
	});
}
