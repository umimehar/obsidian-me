---
title: Obsidian + Claude Code — Complete Usage Guide
tags: [meta/guide]
created: 2026-04-15
updated: 2026-04-15
status: active
type: permanent
---

# Obsidian + Claude Code — Complete Usage Guide

Your vault is a compounding knowledge system. Raw material flows in, gets synthesized into cross-linked wiki pages, and every addition makes the whole vault smarter. This guide covers every folder, every workflow, and every prompt you can use.

---

## Vault Structure at a Glance

```
vault/
  inbox/              Capture zone — raw, unstructured input
  wiki/               Compounding knowledge layer
    concepts/          Core ideas, patterns, mental models
    entities/          People, tools, services, organizations
    sources/           Processed articles, books, talks
    hot.md             Recent session cache (read first)
    index.md           Master directory of all wiki pages
  projects/           Active project context and decisions
  daily-notes/        Chronological activity log (one per day)
  references/         Evergreen cheat sheets and stable docs
  templates/          Note templates for consistent formatting
  CLAUDE.md           Claude's orientation document (do not delete)
  usage.md            This file
```

---

## Session Commands

### `/resume` — Start a Session
Claude reads `wiki/hot.md` and the latest daily note, then summarizes where you left off, what's pending, and any open loops.

### `/save` — End a Session
Claude creates/updates today's daily note in `daily-notes/`, logs what was done, and refreshes `wiki/hot.md` so the next session picks up seamlessly.

### Review Past Work
```
"What did I work on this week?"
"Show me open loops from the last 3 daily notes"
"Summarize my progress on [project] from daily notes"
```

---

## `inbox/` — Capture Zone

Dump anything here without worrying about structure. No formatting required. Claude synthesizes it into proper wiki pages later.

### What Goes Here
- Raw meeting notes and brain dumps
- Copied articles or research snippets
- Voice transcription dumps
- Screenshots with annotations
- Rough ideas before they're fully formed
- Bookmarked links with brief context

### Prompts
```
"Save this to inbox: [paste anything]"
"I had a meeting about X. Here are my rough notes: [paste]. Save to inbox."
"Dump this research into inbox, I'll process it later."
"Save this article summary to inbox/oauth2-research.md"
```

### Processing Inbox into Wiki
```
"Take inbox/meeting-notes-auth.md and synthesize into wiki pages"
"Process everything in inbox/ and create wiki entries"
"Read inbox/api-design-thoughts.md and extract concepts into wiki/concepts/"
```

### Rules
- One topic per file when possible
- Use descriptive filenames: `auth-redesign-meeting-2026-04-15.md`
- Processed items can be deleted or moved to `references/`

---

## `wiki/` — Compounding Knowledge Layer

The heart of the vault. Each page is an atomic concept, densely cross-linked. Raw material from `inbox/` gets synthesized here. Knowledge compounds — each new page enriches the entire network.

### Conventions (All Wiki Pages)
- One concept per page (atomic notes)
- Minimum 2 `[[wikilinks]]` per page (dense linking)
- Always include YAML frontmatter
- Kebab-case filenames: `event-driven-architecture.md`
- Cross-reference related concepts in a "Related Links" section
- Cite sources when synthesizing from external material

---

### `wiki/concepts/` — Ideas & Patterns

Core ideas, mental models, technical concepts. One atomic idea per page, densely linked to related concepts.

#### What Goes Here
- Programming patterns (event-driven architecture, CQRS, pub/sub)
- Mental models (first principles thinking, inversion)
- Technical concepts (OAuth2 PKCE flow, WebSocket lifecycle)
- Design patterns (observer, dependency injection, strategy)
- Algorithms and data structures you want to remember

#### Example Files
`oauth2-pkce-flow.md`, `event-driven-architecture.md`, `react-server-components.md`, `database-indexing-strategies.md`, `cqrs-pattern.md`, `rate-limiting-algorithms.md`

#### Prompts
```
"Create a concept page for [topic] in wiki/concepts/"
"Explain [concept] and save it as a wiki concept page"
"What concepts do I have documented about authentication?"
"What concepts am I missing about distributed systems?"
"Update wiki/concepts/[note].md with what we just learned"
"Link wiki/concepts/oauth2-pkce-flow.md to wiki/concepts/jwt-tokens.md"
```

#### Page Structure
1. **One-paragraph definition** — what is this concept?
2. **Key details** — how it works, when to use it
3. **Related Links** — `[[wikilinks]]` to related concepts, entities, and sources
4. **Source** — where you learned it (if applicable)

---

### `wiki/entities/` — People, Tools & Services

Profiles of tools, frameworks, people, organizations, and platforms. Each page covers what it is, why it matters, and how it connects to your work.

#### What Goes Here
- **Tools and Services** — Supabase, Stripe, Vercel, Redis, Docker
- **Frameworks and Libraries** — Next.js, React, Tailwind, Prisma
- **People** — collaborators, mentors, key contacts with context
- **Organizations** — companies, teams, communities
- **APIs and Platforms** — GitHub API, OpenAI API, Cloudflare Workers
- **Languages and Runtimes** — TypeScript, Python, Node.js, Bun

#### Example Files
`supabase.md`, `next-js-app-router.md`, `stripe-webhooks.md`, `tailwind-css.md`, `vercel.md`, `prisma-orm.md`, `redis.md`

#### Prompts
```
"Create an entity page for Supabase in wiki/entities/"
"Document what I know about Stripe webhooks in wiki/entities/"
"What tools do I have documented?"
"Update wiki/entities/next-js-app-router.md with the new caching behavior"
"Compare my entity pages for Supabase vs Firebase"
"Add a new entity page for [tool] with pros, cons, and when I'd use it"
```

#### Page Structure
1. **What it is** — one-line description
2. **Why it matters** — why it's in your toolkit
3. **Key features / how you use it** — practical notes
4. **Gotchas** — pitfalls, limitations, things to watch out for
5. **Related Links** — `[[wikilinks]]` to concepts that use this entity, projects that depend on it

---

### `wiki/sources/` — Processed Source Material

Distilled articles, videos, books, and talks with citations, key takeaways, and links to concepts they inform.

#### What Goes Here
- Blog posts and articles you've read
- Conference talks and video summaries
- Book notes and chapter takeaways
- Podcast episode highlights
- Documentation deep-dives
- Research papers and whitepapers
- Tutorials you've completed with lessons learned
- Twitter/X threads with valuable insights

#### Example Files
`karpathy-llm-wiki-post.md`, `owasp-top-10-2025.md`, `kent-beck-tdd-book.md`, `react-19-upgrade-guide.md`, `martin-fowler-microservices-talk.md`

#### Prompts
```
"Read this article and create a source note in wiki/sources/: [paste or URL]"
"Summarize this video transcript and save to wiki/sources/"
"What sources do I have about performance optimization?"
"Create a source note for [book/article] with key takeaways"
"What concepts did I extract from wiki/sources/[source].md?"
"Find sources that relate to wiki/concepts/[concept].md"
```

#### Page Structure
1. **Source metadata** — title, author, URL/reference, date consumed
2. **Summary** — 2-3 sentence overview
3. **Key Takeaways** — bullet list of the most valuable insights
4. **Extracted Concepts** — `[[wikilinks]]` to concept pages this source informed
5. **Quotes** — notable direct quotes (if applicable)
6. **My Thoughts** — your personal reaction or how it applies to your work

#### Extra Frontmatter for Sources
```yaml
---
title: Karpathy LLM Wiki Post
tags: [source/article, ai, knowledge-management]
created: 2026-04-15
source: https://x.com/karpathy/status/...
author: Andrej Karpathy
---
```

---

### `wiki/hot.md` — Session Context Cache

Recent session context for quick resume. This is the first file Claude reads on `/resume`. Auto-updated via `/save`.

```
"What's in my hot cache right now?"
"Update wiki/hot.md with current session context"
"Clear wiki/hot.md and start fresh"
```

---

### `wiki/index.md` — Master Wiki Index

Central directory of all wiki pages organized by category. Kept up to date as pages are added.

```
"Update wiki/index.md with all current wiki pages"
"What's in my wiki index?"
```

---

### Wiki Operations

#### Query Your Knowledge
```
"What do I know about [topic]?"
"Search my vault for anything related to [keyword]"
"Find all notes mentioning [concept]"
```

#### Cross-Link and Strengthen
```
"Add backlinks between [note-a] and [note-b]"
"Read wiki/concepts/[note].md and suggest notes it should link to"
"Find orphaned wiki pages with no incoming links"
```

#### Maintain and Lint
```
"Lint the wiki — find dead links, orphans, and gaps"
"Update wiki/index.md with all current wiki pages"
"What topics are missing from my wiki that I should document?"
```

#### Gap Analysis
```
"Survey wiki/concepts/ and list topics a senior engineer would expect that aren't covered"
"What's missing from my knowledge on [domain]?"
"Compare my wiki to [framework docs] and identify gaps"
```

---

## `projects/` — Active Project Context

Architecture decisions, feature plans, bug investigations, and project-specific knowledge that persists across Claude Code sessions.

### What Goes Here
- Architecture decision records (ADRs)
- Feature design docs
- Bug investigation notes
- Sprint plans and progress logs
- Tech stack decisions with rationale
- API designs and data models
- Deployment and infrastructure notes

### Recommended Structure Per Project
```
projects/
  my-app/
    architecture.md       System design, tech stack
    decisions.md          Key decisions with rationale
    features/             Feature-specific notes
    bugs/                 Bug investigations
    README.md             Project overview and status
```

### Prompts
```
"Create a project folder for my-app with architecture and decisions notes"
"Document the decision to use Supabase over Firebase in projects/my-app/decisions.md"
"Log today's bug investigation in projects/my-app/bugs/auth-token-expiry.md"
"What architecture decisions have I made for my-app?"
"Update projects/my-app/architecture.md with the new caching layer"
"What's the tech stack for [app]?"
"Summarize the current architecture of [app]"
"What's pending for [app]?"
```

### Cross-Referencing
Link project notes to wiki concepts — e.g., `projects/my-app/architecture.md` links to `[[oauth2-pkce-flow]]` and `[[supabase]]`. This connects project-specific decisions to your broader knowledge base.

---

## `daily-notes/` — Chronological Activity Log

One note per day capturing what happened, what was decided, and what's pending. Files named `YYYY-MM-DD.md`.

### What Goes Here
- Session logs (auto-created via `/save`)
- Daily standup notes
- What you worked on and why
- Decisions made during the day
- Blockers and open questions
- Links to notes created or modified that day

### Example Daily Note
```markdown
---
title: Daily Note — 2026-04-15
tags: [daily]
created: 2026-04-15
status: active
type: daily
---

# 2026-04-15

## Today's Focus
- Ship auth feature for my-app

## Session Log
- Implemented [[oauth2-pkce-flow]] in the login page
- Fixed token refresh bug (see [[auth-token-expiry]])
- Decided to use httpOnly cookies over localStorage

## Notes
- Need to add rate limiting before launch

## Open Loops
- [ ] Write tests for token refresh
- [ ] Review Stripe webhook integration
```

### Prompts
```
/save                    (auto-creates today's daily note)
"What did I work on yesterday?"
"Show me all open loops from the last week's daily notes"
"Create today's daily note with focus on auth feature"
"Append to today's daily note: decided to switch from REST to GraphQL"
"Summarize my daily notes from the past 5 days"
"What decisions did I make this week?"
```

### Tips
- Let `/save` handle creation — don't manually create daily notes
- Review weekly: scan open loops and close resolved ones
- Link to wiki pages and project notes for context

---

## `references/` — Evergreen Reference Material

Stable knowledge that doesn't change often. Lookup-oriented documents you consult repeatedly.

### What Goes Here
- Cheat sheets and quick references
- Configuration guides (e.g., "How I set up my dev environment")
- Glossaries and terminology definitions
- Standard operating procedures
- Bookmarked resources with summaries
- Processed inbox items worth keeping long-term
- Reusable code snippets with explanations

### Example Files
`git-cheat-sheet.md`, `tailwind-responsive-breakpoints.md`, `postgres-useful-queries.md`, `my-dev-environment-setup.md`, `useful-cli-tools.md`

### Prompts
```
"Create a cheat sheet for [tool/language] in references/"
"Document my dev environment setup in references/"
"Create a quick reference for useful PostgreSQL queries"
"Move inbox/docker-setup-notes.md to references/ — it's stable now"
"What reference notes do I have about [topic]?"
"Show me my git cheat sheet"
```

### References vs. Wiki

| References | Wiki |
|------------|------|
| Stable, rarely updated | Evolves as knowledge grows |
| Lookup-oriented (cheat sheets) | Concept-oriented (understanding) |
| Standalone documents | Cross-linked network |
| "How to do X" | "What is X and why" |

---

## `templates/` — Note Templates

Templates ensure consistent formatting. Claude uses them automatically when creating new notes.

### Available Templates

- **`default-note.md`** — Standard template for any new note. Includes frontmatter with title, tags, dates, status, and type.
- **`daily-note.md`** — Template for daily notes. Sections for focus, session log, notes, and open loops.

### Prompts
```
"Create a new note using the default template"
"Create today's daily note using the daily-note template"
"Create a template for bug investigation notes"
"Add a meeting notes template to templates/"
"Create a project kickoff template with goals, stack, and timeline"
```

### Rules
- Do not modify existing templates without asking
- All templates must include YAML frontmatter
- Use `{{title}}` and `{{date}}` as placeholders
- Keep templates minimal — structure without filler content

---

## Advanced Workflows

### Compounding Knowledge Loop
```
1. "Save this to inbox: [raw material]"
2. "Synthesize inbox/[file].md into wiki pages"
3. "Cross-link the new pages with existing wiki entries"
4. "Update wiki/index.md"
```
Each cycle makes your vault smarter. New material enriches existing pages.

### Research Loop
```
1. "Research [topic] and save to inbox"
2. "Synthesize into wiki/concepts/[topic].md"
3. "What related concepts should I also research?"
4. "Fill those gaps with more research"
```

### Weekly Review
```
"Summarize my daily notes from this week"
"List all open loops across daily notes"
"What wiki pages were created or updated this week?"
"Are there any orphaned notes that need linking?"
"Lint the wiki and report health"
```

### Cross-Project Insights
```
"What patterns do I use across multiple projects?"
"Find common architectural decisions across all projects"
"Are there any wiki concepts referenced by more than 3 project notes?"
```

### Voice-to-Vault (for mobile/dictation)
```
"Here's a voice transcription: [paste]. Clean it up and save to inbox."
"Process this dictation into proper notes"
```

### Export and Share
```
"Export wiki/concepts/[topic].md as a clean markdown document"
"Create a summary of projects/[app]/ suitable for a README"
"Compile my wiki entries on [domain] into a single reference doc"
```

---

## Vault Maintenance

### Health Checks
```
"List all files in the vault"
"Find notes without frontmatter"
"Find notes with no wikilinks (orphans)"
"Check for broken wikilinks"
```

### Organization
```
"What's in my inbox that hasn't been processed?"
"Are there any notes in the wrong folder?"
"Suggest a better filename for [note]"
```

---

## Quick Start — Your First 5 Minutes

1. **Dump something:** `"Save this to inbox: I want to build a habit tracker app using Next.js and Supabase"`
2. **Synthesize it:** `"Process inbox and create wiki pages for the key concepts"`
3. **Start a project:** `"Create projects/habit-tracker/ with architecture and decisions notes"`
4. **End the session:** `/save`
5. **Next session:** `/resume` — Claude picks up right where you left off
