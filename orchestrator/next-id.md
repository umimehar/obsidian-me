---
title: "Ticket ID Counter"
tags: [meta/system]
created: 2026-07-13
updated: 2026-07-13
status: active
type: counter
next_id: 1
---

# Ticket ID Counter

Global ticket id allocator. To create a ticket: take `next_id`, zero pad to 4 digits (`TCK-0001`), increment `next_id`, and bump it in the SAME commit that creates the ticket note.
