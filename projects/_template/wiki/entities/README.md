---
title: Entities
tags: [project/name, wiki]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: index
project: name
---

# Entities

People who show up in this project: stakeholders, teammates, customers, vendors, interviewees, authors.

One file per person, kebab-case filename (e.g. `jane-doe.md`). Use `templates/entity.md` as the scaffold. Add `aliases:` in frontmatter so `[[Jane Doe]]` wikilinks resolve.

> On copy, replace `PROJECT_NAME` in the Dataview `FROM` path below with the actual project folder name (Dataview `FROM` is a literal, not an expression).

## Index

```dataview
TABLE filter(file.etags, (t) => startswith(t, "#role/")) AS roles, org, status
FROM "projects/PROJECT_NAME/wiki/entities"
WHERE type = "entity"
SORT file.name ASC
```
