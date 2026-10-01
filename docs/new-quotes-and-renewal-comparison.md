# New customer quotes and renewal comparison

`/insurance-review` is the **新客报价** workspace. Its task list includes unlinked
`lead` tasks from manual new-quote intake and quote-form submissions. A task detail
shows reviewed intake facts (or the original submission when no reviewed intake
exists), independent auto/home requested dates, assignment, priority and comments.
Missing price, coverage and property-type facts remain unconfirmed.

The existing comparison editor saves a task-specific `quoteReview` through
`/api/quote-review`. This uses the existing Team Kanban team store, without needing
the independent profile database. Server-side team membership, task identity and
quote version checks prevent cross-task writes and lost concurrent edits. Each
save adds a task activity entry; archived tasks are read-only. Quote confirmation
does not complete the task, register a ClientCore customer or issue a policy.

Original independent cloud/local Profiles remain accessible through the folded
historical-records entry (`?mode=manual`); they are never matched to tasks by name.

`/renewals` owns the renewal queue, comparison and existing processing views.
Existing saved `/insurance-review?taskId=<renewal>` URLs redirect to this route.
The current ClientCoreBMS private integration provides:

- `GET renewal-reviews` for the upcoming queue.
- `GET clients/:id` and `GET clients/:id/policies?asOf=...` for portfolio identity.
- `GET renewal-reviews/:kind/:id` for the policy snapshot and broker-reviewed
  renewal/alternative prices, coverage rows and recommendation.

Comparisons verify Client ownership, keep unresolved prices empty, omit canceled
and expired policies from current totals, and retain an explicitly selected
historical target for reference. Adopted imported policies do not count again in
current totals. Customer feedback remains audited and protected by task version
and comparison hash.

The missing legacy `renewal-queue` and portfolio `renewal-comparison` API requests
are no longer used. The current BMS integration does not expose PDF-download or
the older renewal-processing/quote-job APIs. The comparison displays PDF
unavailability explicitly; this change does not add or claim support for those
processing operations.

Validation uses fictional tasks, an isolated local team database and signed
mock ClientCore responses. No production customer records or AWS configuration
are changed. Pull, build and release this branch locally to update the hosted app.
