---
title: Project Name
tags: [project/name]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: project
project: name
---

# Project Name

## Overview

One-paragraph description of what this project does and why it exists.

## Tech Stack

- **Frontend:**
- **Backend:**
- **Database:**
- **Hosting:**
- **CI/CD:**

## Links

- **Repo:**
- **Staging:**
- **Production:**
- **Design:**
- **Tickets:**

## Current Status

<!-- What's the current state? What milestone are we at? -->

## Team

<!-- Who's involved? Roles? -->

## Key Files

<!-- Important files in the codebase to know about -->

```

```

## Recent Standups

```dataview
TABLE created as "Date"
FROM "standup"
WHERE contains(project-tags, this.project)
SORT created DESC
LIMIT 10
```

## Recent Logs

```dataview
TABLE title as "Entry"
FROM "projects/" + this.file.folder + "/log"
SORT created DESC
LIMIT 10
```

## Open Bugs

```dataview
TABLE status, title
FROM "projects/" + this.file.folder + "/bugs"
WHERE status = "open"
SORT created DESC
```
