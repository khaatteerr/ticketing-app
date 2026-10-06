# ticketing-app

This project was created using the [Ktor Project Generator](https://start.ktor.io).

Here are some useful links to get you started:

* [Ktor Documentation](https://ktor.io/docs/home.html)
* [Ktor GitHub page](https://github.com/ktorio/ktor)
* [Ktor Slack chat](https://app.slack.com/client/T09229ZC6/C0A974TJ9). [Request an invite](https://surveys.jetbrains.com/s3/kotlin-slack-sign-up).

## Features

Here's a list of features included in this project:

| Name | Description |
|------|-------------|

## Building & Running

To build or run the project, use one of the following tasks:

| Task | Description |
|------|-------------|

If the server starts successfully, you'll see the following output:

```
2024-12-04 14:32:45.584 [main] INFO  Application - Application started in 0.303 seconds.
2024-12-04 14:32:45.682 [main] INFO  Application - Responding at http://0.0.0.0:8080
```

## Electron desktop widget

The desktop widget is now a native Electron app with a draggable floating icon.
Hover to open, select an issue head and sub-issue, then submit. Clicking inside
keeps the panel open; use the minus button or Escape to collapse it. Right-click
the icon to quit. Lists use server-side search and pages of eight records.

The default server is `http://192.168.180.48:6080`, editable at sign-in. The app
uses the existing work-account login and stores only the session token encrypted
with the operating system. Passwords are never saved. Users sign in again when
the session expires. The browser popup has been replaced by a desktop setup page.

See [desktop-widget/README.md](desktop-widget/README.md) for Windows distribution,
local development, and checks.

## RealVNC on Windows support PCs

The VNC button supplies the ticket IP to RealVNC's registered URI handler. For a
Viewer at `C:\Program Files\RealVNC\VNC Viewer\vncviewer.exe` without a working URI
handler, the VNC dialog includes **Windows: connect using vncviewer.exe** setup:

1. Download `Install-HelpDeskVnc.ps1` from that dialog and run it on the **support
   PC**, using Windows PowerShell 5.1 (not on the ticketing server).
2. Enable **Use Windows launcher (after setup)** in that browser.
3. Click **Connect with RealVNC**, and accept the browser's external-app prompt.
   Future ticket VNC clicks use the saved preference and supply each ticket's IP.

The script checks the Viewer path, compiles a small local launcher under
`%LOCALAPPDATA%\HelpDeskVnc`, and registers `helpdesk-vnc:` under
`HKCU\Software\Classes\helpdesk-vnc`. It needs no administrator rights. The
launcher accepts only an IP address and starts the fixed Viewer executable
without a command shell. It passes no credentials and does not suppress VNC
sign-in or browser prompts. Missing Viewer and invalid links show an error.
If organizational policy blocks the downloaded script, have IT review and deploy
it; do not change the organization's execution policy.

To remove the integration, disable the browser option, remove the above per-user
registry key, and delete the `HelpDeskVnc` folder after closing the launcher.

RealVNC documentation:
- [Launching Viewer through a web link](https://help.realvnc.com/hc/en-us/articles/6449870411037-Can-I-launch-RealVNC-Viewer-from-a-link-on-a-web-page-or-program-using-URIs)
- [Viewer command-line connections](https://help.realvnc.com/hc/en-us/articles/360002310477-vncviewer-man-page)

The Windows setup must be verified on a Windows support PC; the repository's
JavaScript tests validate link selection, IP handling, and clipboard fallbacks.

## Server-side paging and database queries

Collection GET endpoints return `data` as an array plus:

```json
{"pagination":{"page":1,"pageSize":25,"total":123,"totalPages":5}}
```

- `page` starts at 1. `pageSize` defaults to 25 and is capped at 100.
  Empty results report page 1 of 1; out-of-range pages clamp to the last page.
- `search` performs a literal, case-insensitive contains search (up to 120
  characters). `sort` is allowlisted per endpoint; `order` is `asc` or `desc`.
  MongoDB sorts with `_id` as a stable tie-breaker before applying skip/limit.
- Tickets accept `scope=assigned|submitted`, `status`, `priority`, `department`,
  `category`, and `assignedTo` (username). Access rules are ANDed with filters.
- Users accept `role`, `status=active|suspended`, `source`, `department`, and
  `recentSync=true`. `summary=true` adds global role counts for summary cards.
- Departments and categories accept search. Sub-issues also accept `headId` and
  `department`. Issue heads support department-aware search. The tree endpoint
  pages heads and returns the first ten sub-issues per head with child pagination;
  `/api/sub-issues?headId=...&page=...` retrieves subsequent child pages.
- Dashboard, users, departments, issues, AD lists, employee ticket lists, and
  option selectors use server pages. Search is debounced; superseded requests are
  cancelled and stale responses ignored. CSV/JSON buttons explicitly export the
  current ticket page. Local browser activity logs remain local.

Startup creates non-unique query indexes for common filters, sorts, and joins.
The MongoDB account needs permission to create indexes. No ticket migration is
performed. Configured ticket priority is resolved in a database lookup; ordinary
requests resolve only the requested page, while priority filters/sorts resolve
before paging. Counts are computed in MongoDB, not from the visible page.

Contains searches can still scan many indexed documents, and deep offset pages
cost more than early pages. Measure production query plans before deciding on
Atlas Search or cursor pagination for very large collections. No production
latency benchmark is implied by the unit tests.

Validation without connecting to the configured database:

```sh
node --test src/test/js/*.test.cjs
./gradlew test --tests '*PagingTest' --tests '*TicketReplyTest' --offline
```
