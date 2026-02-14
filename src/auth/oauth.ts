import { requestUrl } from "obsidian";
import type { XTokenResponse, XUserMeResponse } from "../api/types";
import type { XBookmarksSyncSettings } from "../settings";

function generateRandomString(length: number): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
	const values = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(values)
		.map((v) => chars[v % chars.length])
		.join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PKCEState {
	codeVerifier: string;
	state: string;
}

export async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
	state: string;
}> {
	const codeVerifier = generateRandomString(64);
	const hashed = await sha256(codeVerifier);
	const codeChallenge = base64UrlEncode(hashed);
	const state = generateRandomString(32);
	return { codeVerifier, codeChallenge, state };
}

export function buildAuthorizationUrl(
	clientId: string,
	codeChallenge: string,
	state: string
): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: "obsidian://x-bookmarks-sync",
		scope: "bookmark.read tweet.read users.read offline.access",
		state: state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});
	return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
	code: string,
	codeVerifier: string,
	clientId: string,
	clientSecret: string
): Promise<XTokenResponse> {
	const basicAuth = btoa(`${clientId}:${clientSecret}`);

	const body = new URLSearchParams({
		code: code,
		grant_type: "authorization_code",
		redirect_uri: "obsidian://x-bookmarks-sync",
		code_verifier: codeVerifier,
	});

	const response = await requestUrl({
		url: "https://api.x.com/2/oauth2/token",
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${basicAuth}`,
		},
		body: body.toString(),
	});

	if (response.status !== 200) {
		throw new Error(
			`Token exchange failed (${response.status}): ${response.text}`
		);
	}

	return response.json as XTokenResponse;
}

export async function refreshAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<XTokenResponse> {
	const basicAuth = btoa(`${clientId}:${clientSecret}`);

	const body = new URLSearchParams({
		refresh_token: refreshToken,
		grant_type: "refresh_token",
		client_id: clientId,
	});

	const response = await requestUrl({
		url: "https://api.x.com/2/oauth2/token",
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${basicAuth}`,
		},
		body: body.toString(),
	});

	if (response.status !== 200) {
		throw new Error(
			`Token refresh failed (${response.status}): ${response.text}`
		);
	}

	return response.json as XTokenResponse;
}

export async function fetchCurrentUser(
	accessToken: string
): Promise<XUserMeResponse> {
	const response = await requestUrl({
		url: "https://api.x.com/2/users/me",
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (response.status !== 200) {
		throw new Error(
			`Failed to fetch user (${response.status}): ${response.text}`
		);
	}

	return response.json as XUserMeResponse;
}

export async function ensureValidToken(
	settings: XBookmarksSyncSettings,
	saveSettings: () => Promise<void>
): Promise<string> {
	if (!settings.accessToken || !settings.refreshToken) {
		throw new Error("Not authenticated. Please connect your X account first.");
	}

	const now = Date.now();
	const fiveMinutes = 5 * 60 * 1000;

	if (settings.tokenExpiresAt - now > fiveMinutes) {
		return settings.accessToken;
	}

	const tokenResponse = await refreshAccessToken(
		settings.refreshToken,
		settings.clientId,
		settings.clientSecret
	);

	settings.accessToken = tokenResponse.access_token;
	settings.refreshToken = tokenResponse.refresh_token;
	settings.tokenExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
	await saveSettings();

	return settings.accessToken;
}
