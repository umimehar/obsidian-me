---
title: Sources
tags: [project/name, wiki]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: index
project: name
---

# Sources

Articles, books, talks, papers, podcasts, and videos that inform this project. One file per source, kebab-case filename (e.g. `designing-data-intensive-applications.md`). Use `templates/source.md` as the scaffold.

Link sources from decisions, features, and spikes when they influenced the work.

> On copy, replace `PROJECT_NAME` in the Dataview `FROM` path below with the actual project folder name (Dataview `FROM` is a literal, not an expression).

## Index

```dataview
TABLE source_kind, author, rating
FROM "projects/PROJECT_NAME/wiki/sources"
WHERE type = "source"
SORT file.name ASC
```
