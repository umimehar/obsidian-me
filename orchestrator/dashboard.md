---
title: "Orchestrator Dashboard"
tags: [meta/system]
created: 2026-07-02
updated: 2026-07-02
status: active
type: dashboard
---

# Orchestrator Dashboard

> These Dataview tables render only inside the Obsidian app. For a headless, terminal/cron/agent view of the same rollups (lane counts, throughput, stale claims, backlog-rot metrics), run `node config/claude/skills/obsidian-loop/select-tickets.mjs --status` (add `--json` for machine output). See TCK-0036.

## Control state

```dataview
TABLE WITHOUT ID loop AS Loop, max_tickets_per_day AS "Max/day", max_effort AS "Max effort", allowed_types AS "Allowed types", devices_enabled AS "Daemon devices"
FROM "orchestrator"
WHERE type = "control"
```

## In flight

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, claimed_by AS Device, status AS Status, priority AS Pri
FROM #ticket
WHERE status = "claimed" OR status = "in-progress"
SORT priority ASC
```

## Ready queue

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, priority AS Pri, effort AS Effort, assigned_device AS Device
FROM #ticket
WHERE status = "ready"
SORT priority ASC, created ASC
```

## In review

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, claimed_by AS "Worked by", updated AS Updated
FROM #ticket
WHERE status = "review"
SORT updated DESC
```

## Blocked / failed

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, status AS Status, updated AS Updated
FROM #ticket
WHERE status = "blocked" OR status = "failed"
SORT updated ASC
```

## Stale claims (no update in over a day)

```dataview
TABLE WITHOUT ID file.link AS Ticket, claimed_by AS Device, updated AS "Last update"
FROM #ticket
WHERE (status = "claimed" OR status = "in-progress") AND updated < date(today) - dur(1 day)
```

## Awaiting triage (agent created)

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, created_by AS "Created by", created AS Created
FROM #ticket
WHERE status = "backlog" AND startswith(created_by, "agent:")
SORT created ASC
```

## Done (last 14 days)

```dataview
TABLE WITHOUT ID file.link AS Ticket, project AS Project, claimed_by AS Device, updated AS Done
FROM #ticket
WHERE status = "done" AND updated >= date(today) - dur(14 days)
SORT updated DESC
```

## Throughput per week

```dataview
TABLE WITHOUT ID Week, length(rows) AS Completed
FROM #ticket
WHERE status = "done" AND updated
GROUP BY dateformat(updated, "kkkk-'W'WW") AS Week
SORT Week DESC
```

## Tickets by status

```dataview
TABLE length(rows) AS Count
FROM #ticket
GROUP BY status
```

## Devices

```dataview
TABLE WITHOUT ID slug AS Device, hostname AS Host, daemon AS Daemon, last_heartbeat AS Heartbeat, choice(last_heartbeat < date(now) - dur(48 hours), "⚠️ stale (>48h)", "ok") AS Health, repos AS Repos
FROM "orchestrator/devices"
WHERE type = "device"
SORT last_heartbeat ASC
```

## Boards

- [[orchestrator/board|Central board]]
- [[projects/alrai/board|alrai]] · [[projects/delo/board|delo]] · [[projects/xyzbytes/board|xyzbytes]]
- [[orchestrator/control|Control]] · [[orchestrator/activity.log|Activity log]] · [[orchestrator/design|Design spec]]
