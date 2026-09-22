# X Bookmarks Sync

An Obsidian plugin that syncs your X.com (Twitter) bookmarks as markdown notes with rich frontmatter metadata.

## Features

- **OAuth 2.0 PKCE** authentication with X (no server required)
- **Automatic content type detection** - classifies bookmarks as article, video, podcast, code, newsletter, or tweet based on shared URLs
- **Rich frontmatter** - type, title, link, source, author, description, tags, and dates
- **Deduplication** - tracks synced bookmarks to avoid duplicates across syncs
- **Incremental sync** - only fetches new bookmarks since last sync
- **Full sync** - re-fetch all bookmarks when needed
- **Rate limit handling** - respects X API rate limits with automatic backoff
- **Hashtag extraction** - pulls hashtags from tweets into note tags
- **Note tweets** - supports X's long-form note tweets
- **AI triage (optional)** - sorts each bookmark into your own categories and tags as it is saved

## Requirements

- Obsidian v1.4.0+ (desktop only)
- An X Developer App with OAuth 2.0 enabled

## Setup

1. Go to the [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a new App (or use an existing one)
3. Under "User authentication settings", enable **OAuth 2.0**
4. Set Type of App to **"Native App"** or **"Single page App"**
5. Add `obsidian://x-bookmarks-sync` as a **Redirect URI**
6. Copy the **Client ID** and **Client Secret**
7. In Obsidian, go to Settings > X Bookmarks Sync
8. Paste your Client ID and Client Secret
9. Click **Connect** to authorize

## Usage

**Sync bookmarks:**
- Click the bookmark icon in the ribbon, or
- Use the command palette: `X Bookmarks Sync: Sync X Bookmarks`

**Full sync (re-fetch all):**
- Command palette: `X Bookmarks Sync: Full Sync X Bookmarks (re-fetch all)`

**Rebuild sync index:**
- If you've manually added or removed bookmark files, use `Rebuild X Bookmarks Sync Index` to re-scan existing files

## Settings

| Setting | Description | Default |
|---|---|---|
| Bookmarks folder | Vault path where notes are created | `Bookmarks` |
| Sync on startup | Auto-sync when Obsidian opens | Off |
| Max bookmarks per sync | Limit per sync (0 = unlimited) | 0 |
| Default tags | Comma-separated tags for all bookmarks | `clippings` |
| Auto-detect content type | Classify based on URLs in tweets | On |
| Enable Jev triage | Sort each new bookmark with AI | Off |
| TypeSafe API key | Your key from typesafe.ai | empty |
| Jev model | Pinned model version | `jev-1.13.0` |
| Category confidence threshold | Below this, writes `needs-review` | 0.5 |
| Tag probability threshold | A tag is added only above this | 0.7 |
| Categories | Your filing system, one per line | a starter set |
| Tags | Your tags, one per line | a starter set |

## AI Triage (optional)

Off by default. When on, each new bookmark is sorted before the note is
written: it gets a `category:`, up to four `tags:` from your own list, and a
`signal:` score from 0 to 1 for how likely you are to come back to it.

It uses [TypeSafe Jev](https://typesafe.ai), which answers typed questions
rather than returning free text. You need an API key. Roughly one request per
bookmark.

**The categories and tags are yours.** Write them in settings, one per line:

```
Reading: Long-form articles and essays meant to be read end to end
Tools: A specific app, library, CLI or repository, where the tool is the point
Reference: Documentation and how-tos you would come back to look something up
Other: None of the above fits well
```

```
tutorial: A step-by-step how-to or guide
open-source: An open-source project or repository
research: A paper, study, benchmark or original research
```

The label before the colon is written to `category:`. The text after it tells
the model what belongs there, so write it the way you would explain it to a
person. An `Other` exit is added for you if you leave it out.

Each tag is a separate question, so a long tag list costs more per bookmark.
The settings screen shows the count.

**When it is unsure, it says so.** If the confidence is below your threshold,
the note gets `category: needs-review` instead of a guess. Search your vault
for `needs-review` to find them.

**It never blocks a sync.** If the key is wrong, the network fails, or the
answer is malformed, the note is still written with `needs-review` and no
`signal:` line. A failure is never treated as a score of zero.

## Content Type Detection

When a bookmarked tweet contains a URL, the plugin classifies the note:

| URL Pattern | Type |
|---|---|
| youtube.com, vimeo.com, twitch.tv, loom.com | video |
| spotify.com/episode, podcasts.apple.com | podcast |
| github.com, gitlab.com, npmjs.com | code |
| substack.com, beehiiv.com | newsletter |
| medium.com, dev.to, arxiv.org | article |
| Other external URLs | article |
| No external URL | tweet |

## Note Format

Each synced bookmark creates a markdown file with frontmatter:

```yaml
---
type:
  - article
title: "Example Article Title"
link: https://example.com/article
source: https://x.com/user/status/123456
author:
  - Display Name
description: The tweet text summarizing this bookmark
related_to:
category:
tags:
  - clippings
  - hashtag
created: 2024-01-15
published_date: 2024-01-14
---
```

## Building from Source

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/x-bookmarks-sync/` directory.

## License

[MIT](LICENSE)
