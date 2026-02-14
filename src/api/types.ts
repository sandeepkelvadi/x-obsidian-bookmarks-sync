export interface XEntityUrl {
	start: number;
	end: number;
	url: string;
	expanded_url: string;
	display_url: string;
	title?: string;
	description?: string;
	unwound_url?: string;
}

export interface XEntityMention {
	start: number;
	end: number;
	username: string;
	id: string;
}

export interface XEntityHashtag {
	start: number;
	end: number;
	tag: string;
}

export interface XTweetEntities {
	urls?: XEntityUrl[];
	mentions?: XEntityMention[];
	hashtags?: XEntityHashtag[];
}

export interface XTweet {
	id: string;
	text: string;
	author_id: string;
	created_at?: string;
	entities?: XTweetEntities;
	attachments?: {
		media_keys?: string[];
	};
	note_tweet?: {
		text: string;
		entities?: XTweetEntities;
	};
	public_metrics?: {
		retweet_count: number;
		reply_count: number;
		like_count: number;
		bookmark_count: number;
		impression_count: number;
	};
	referenced_tweets?: {
		type: "retweeted" | "quoted" | "replied_to";
		id: string;
	}[];
	conversation_id?: string;
}

export interface XUser {
	id: string;
	name: string;
	username: string;
	profile_image_url?: string;
}

export interface XMedia {
	media_key: string;
	type: "photo" | "video" | "animated_gif";
	url?: string;
	preview_image_url?: string;
	alt_text?: string;
}

export interface XBookmarksResponse {
	data?: XTweet[];
	includes?: {
		users?: XUser[];
		media?: XMedia[];
		tweets?: XTweet[];
	};
	meta?: {
		result_count: number;
		next_token?: string;
		previous_token?: string;
	};
	errors?: Array<{
		title: string;
		detail: string;
		type: string;
	}>;
}

export interface XUserMeResponse {
	data: {
		id: string;
		name: string;
		username: string;
	};
}

export interface XTokenResponse {
	token_type: string;
	expires_in: number;
	access_token: string;
	refresh_token: string;
	scope: string;
}

export interface BookmarkNote {
	title: string;
	source: string;
	author: string[];
	published_date?: string;
	created: string;
	description: string;
	tags: string[];
	type: string[];
	link: string;
	category: string[];
	related_to: string;
	filename: string;
	body: string;
	tweetId: string;
}
