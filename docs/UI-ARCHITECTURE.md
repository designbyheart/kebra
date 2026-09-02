# UI architecture

The office UI (`src/components`, `src/app/**/*.tsx`) follows strict atomic design. This
document is the contract: layer definitions, the folder map, the coding rules that ESLint
and review enforce, and how to add a component. Behaviour, routes, data loading and the
domain layer (`src/domain`, `src/agent`, `src/voice`, `src/db`) are out of scope here.

## Layers

| Layer | Folder | What lives here | May import |
|---|---|---|---|
| **Atoms** | `src/components/atoms/` | Single-purpose primitives with no data fetching and no domain calls: buttons, badges, pills, inputs, icons-with-label, status dots, masked text, relative time, `dt/dd` facts. Pure props in, markup out. | `atoms/ui`, `@/lib/ui`, `@/lib/utils`, icons |
| **shadcn primitives** | `src/components/atoms/ui/` | Vendored shadcn/base-ui primitives (`button`, `card`, `dialog`, `sheet`, `table`, …). Managed by the shadcn CLI (`components.json` → `"ui": "@/components/atoms/ui"`). Exempt from the one-component-per-file rule because the CLI owns their shape. | `@/lib/utils`, base-ui |
| **Molecules** | `src/components/molecules/` | Small compositions of atoms with at most local UI state: job card, call row, transcript bubble, date switcher, filter chips, note item, tool chip, page header, nav link, slot picker rows. No data fetching, no server actions. | atoms, `@/lib/ui`, `@/hooks` |
| **Organisms** | `src/components/organisms/` | Sections with data or state: board timeline, job sheet, call detail, activity strip, inbox list, cancellation approval card, nav, user menu, dialogs that call server actions, live-refresh islands. Server organisms may query the DB; client organisms may call server actions and hooks. | molecules, atoms, `@/lib/*`, `@/hooks`, `@/app/*/actions`, `@/app/*/queries` (types) |
| **Templates** | `src/components/templates/` | Page shells and layout compositions used by `src/app/*/page.tsx`: the app shell (sidebar + main), list page, detail page, dossier page, board page, overlay page, board skeleton, providers. Slots only; no data. | organisms, molecules, atoms |
| **Pages** | `src/app/**/page.tsx` (+ `layout.tsx`, `loading.tsx`, `error.tsx`) | Next.js route files. Keep server data loading, auth (`requireUser`) and metadata; render templates and organisms only. No inline markup beyond passing slots. | templates, organisms, `@/lib/*`, route-local `actions.ts` / `queries.ts` / `data.ts` |

Supporting, non-component modules:

| Folder | Contents |
|---|---|
| `src/lib/ui/` | Pure, React-free UI helpers imported by components and routes: formatting (`format.ts`), board layout math (`board-layout.ts`), class-name / label maps (`board-status.ts`, `job-status.ts`, `note-view.ts`), derived call view models (`call-derive.ts`), URL filter parsers (`job-filter-params.ts`, `inbox-grouping.ts`), sensitive-text splitting (`sensitive.ts`), transcript slicing (`transcript-slice.ts`), board data types (`board-types.ts`), dossier fallback summary (`dossier-summary.ts`). Unit tests sit next to the file. |
| `src/hooks/` | Client hooks shared by components: `use-now.ts` (shared 30 s tick, `null` during SSR), `use-clock.ts` (interval re-render), `use-call-feed.ts` (SSE + polling refresh). `@/lib/use-live-events` stays where it is. |
| `src/lib/action-result.ts` | The `ActionResult` shape every server action returns (`runAction`, `toActionError`). |
| `src/app/inbox/cancellation-data.ts`, `src/app/inbox/cancellation-resolve.ts` | Route-local read model and authorization shell for cancellations (server only). |

## Folder map

```
src/components/
  atoms/
    ui/                          shadcn primitives (badge, button, card, dialog, input, label,
                                 scroll-area, select, separator, sheet, sonner, table, tabs,
                                 textarea, tooltip)
    agent-badge.tsx              teal "Agent" pill (jobs / inbox / customers)
    agent-bot-chip.tsx           Bot-icon agent chip (calls)
    agent-tag.tsx                uppercase AGENT tag on the board and activity strip
    brand-link.tsx               "Kebra Front Desk" sidebar link
    fact.tsx                     <dt>/<dd> pair for definition grids
    flag-pill.tsx                needs review / reviewed / handoff pills
    form-field.tsx               label above a control
    kind-pill.tsx                Homeowner / Business
    live-dot.tsx                 pulsing amber dot for live calls
    masked-block.tsx             whole block behind a Reveal button
    masked-text.tsx              inline text with click-to-reveal codes / phones
    native-select.tsx            styled native <select>
    outcome-chip.tsx             call outcome pill
    pending-cancellation-badge.tsx
    priority-badge.tsx           High priority / Emergency pill
    priority-flag.tsx            flag icon tinted by priority (board)
    relative-time.tsx            <time> that shows relative text once hydrated
    resolved-badge.tsx           Canceled / Kept on the books
    section-title.tsx            uppercase section heading with optional aside
    source-badge.tsx             Agent / Office / (nothing for import)
    status-badge.tsx             work-status pill
    status-chip.tsx              board status chip with dot (job sheet header)
    summary-chip.tsx             board header count chips
    tag-badge.tsx
    task-status-badge.tsx
    warranty-pill.tsx
  molecules/
    activity-item.tsx            one event row in the activity strip
    back-link.tsx                "← Jobs" / "← Calls" crumb
    board-summary-chips.tsx      the chip row under the board title
    breadcrumbs.tsx              Customers › Name › Street
    call-action-item.tsx         one "action taken" row
    call-filter-chip.tsx         All / Live / Today / … tab link
    call-promise-item.tsx
    call-row.tsx                 one row of the calls table
    call-search-form.tsx
    call-summary-card.tsx        caller / duration / customer facts on the call page
    call-task-item.tsx
    cancellation-transcript-excerpt.tsx
    customer-search.tsx
    date-switcher.tsx
    dial-fallback.tsx            "Prefer to dial?" footer on /call
    equipment-item.tsx
    evidence-item.tsx
    invoice-disclosure.tsx
    invoice-lines.tsx
    job-card.tsx                 positioned card on the board grid
    jobs-result-summary.tsx      "Showing 40 of 120 · range · order"
    kind-filter-link.tsx         inbox kind chip
    live-status-button.tsx       Live / Connecting pill-button on the board
    nav-link.tsx
    note-item.tsx                author pill + timestamp + masked content
    page-header.tsx
    pending-cancellation-banner.tsx
    refresh-failed-notice.tsx
    session-ended-notice.tsx
    sheet-note-item.tsx          compact note row inside the job sheet
    sheet-pending-cancellation-banner.tsx
    slot-button.tsx              open-window button (job sheet)
    slot-radio-card.tsx          open-window radio card (book job)
    slot-radio-row.tsx           open-window radio row (reschedule)
    status-filter-link.tsx       inbox status tab
    theme-toggle.tsx
    transcript-excerpt.tsx       fallback excerpt when the change request is missing
    transcript-item.tsx          dispatches to turn group / tool chip / system line
    transcript-system-line.tsx
    transcript-tool-chip.tsx
    transcript-turn-group.tsx
    unscheduled-chip.tsx         card in the "Needs scheduling" lane
    upcoming-job-item.tsx
    visit-entry.tsx              one <details> row of the visit timeline
    warranty-pill-with-basis.tsx
  organisms/
    activity-strip.tsx (server) + activity-strip-feed.tsx (client)
    add-note-form.tsx
    address-header.tsx, address-issues.tsx, warranty-card.tsx
    address-matches.tsx, customers-table.tsx, customers-results.tsx
    board.tsx, board-header.tsx, board-timeline.tsx, board-timeline-row.tsx,
    needs-scheduling-lane.tsx
    board-error.tsx
    book-job-dialog.tsx
    call-detail.tsx, call-transcript.tsx, call-actions-section.tsx,
    call-promises-section.tsx, call-summary-section.tsx, review-controls.tsx
    call-list.tsx
    cancel-dialog.tsx, reschedule-dialog.tsx, job-actions.tsx
    cancellation-actions.tsx, cancellation-approval-card.tsx (server),
    cancellation-approval-card-view.tsx, cancellations-queue.tsx
    cancellation-live-refresh.tsx, entity-live-refresh.tsx,
    inbox-live-refresh.tsx, job-live-refresh.tsx
    customer-header.tsx, sites-card.tsx, invoices-card.tsx, preferences-card.tsx,
    recent-calls-card.tsx
    equipment-panel.tsx, summary-card.tsx, upcoming-jobs.tsx, visit-timeline.tsx
    inbox-filters.tsx, inbox-group.tsx, inbox-item.tsx, inbox-item-actions.tsx,
    inbox-list.tsx
    job-header.tsx, job-actions-card.tsx, job-notes-card.tsx, job-invoices-card.tsx,
    job-inbox-items-card.tsx
    job-filters.tsx, jobs-table.tsx
    job-sheet.tsx, job-sheet-header.tsx, job-sheet-notes.tsx, job-sheet-reschedule.tsx,
    job-sheet-reassign.tsx, job-sheet-status.tsx
    login-form.tsx
    nav.tsx, user-menu.tsx
    note-list.tsx
    web-call-panel.tsx
  templates/
    app-shell.tsx                sidebar + main + toaster (root layout body)
    theme-provider.tsx           next-themes provider
    board-page.tsx               board + sticky activity strip (Today)
    board-skeleton.tsx           /today loading state
    detail-page.tsx              live island + crumb + header + content stack
    dossier-page.tsx             breadcrumb + header + 2/1 grid + activity strip
    list-page.tsx                page header + content (Calls, Customers, Jobs, Inbox)
    overlay-page.tsx             centered panel covering the shell (Login, Call)
```

## Rules

1. **Strict layering.** A file imports only from its own layer or below (see the table).
   Atoms never fetch or import `@/domain`, `@/db`, `@/agent`. No `"use client"` file imports
   `@/domain`, `@/db` or `@/agent` (type-only imports are fine).
2. **No ternary operators** in `src/components/**` and `src/app/**/*.tsx`. ESLint core rule
   `no-ternary` is on for those globs. Use early returns, guard clauses, `&&`, named consts
   or lookup maps (`Record<Key, string>`), and small helper functions.
3. **No inline style objects.** `style={{ ... }}` is only allowed for values that are truly
   dynamic and computed (timeline positioning, a live volume bar). Those go through a tiny
   named helper that returns the style object and carries a comment explaining why it
   cannot be a class. Prop-dependent class names use `cn()` with named `as const` maps.
4. **One component per file**, named export, exported props type (`export type XProps`),
   kebab-case file name matching the component (`job-card.tsx` → `JobCard`). The only
   exceptions are the vendored `atoms/ui/*` files and Next.js route files, which need a
   default export.
5. **A control gets its own atom** instead of being defined inline in the molecule or
   organism that first needs it; the parent decides whether to render it.
6. **Design is frozen.** Urbanist via `--font-urbanist`, 14 px minimum type size, the
   light/dark palette in `globals.css`, and every interaction stay as they are. Structural
   refactors move markup, they do not restyle it.

## How to add a component

1. Decide the layer by asking: does it fetch data or call a server action (organism)? Is it
   a composition of a few atoms with at most local state (molecule)? Is it one primitive
   (atom)? Is it a page shell (template)?
2. Create `src/components/<layer>/<kebab-name>.tsx` with a single named export and an
   exported `<Name>Props` type. Add `"use client"` only when the component uses state,
   effects, browser APIs or event handlers.
3. Put any prop → class mapping in a `const X = { ... } as const` (or `Record<...>`) and
   combine with `cn()`. Put React-free helpers in `src/lib/ui/` with a unit test.
4. If the component needs a new primitive (a select, a pill, a chip), add it to `atoms/`
   first, then compose it.
5. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.

## Verification

`pnpm lint` (includes `no-ternary`), `pnpm test`, `pnpm build`, and a manual pass over
`/today`, `/calls`, `/customers`, an address page, `/jobs`, `/inbox`, `/call`, `/login`
in both themes.
