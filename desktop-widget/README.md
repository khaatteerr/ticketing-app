# HelpDesk desktop widget

## Windows users

Extract `dist/HelpDesk Widget-1.0.0-win.zip` completely and run `HelpDesk Widget.exe`.
Keep all extracted files together. Hover over the floating icon to sign in using
your existing work account. Default server: `http://192.168.180.48:6080`.
Change the address on the sign-in screen if needed (sign out first).

Choose an issue head, choose a sub-issue, then submit. Search and pagination fetch
only eight entries at a time. Tickets use the signed-in user's department and the
selected issue's priority. The server records the submitting computer's network
address using the same API as the browser. “Open my tickets” opens the website,
which has its own browser login.

Drag the icon to reposition it. Hover opens the panel without stealing focus;
click inside to keep it open. Minus or Escape collapses it. Right-click the icon
to reset its position or quit. Run the app once to register `helpdesk-widget:`;
the website's Desktop Widget page can then launch it. This ZIP does not enable
automatic startup. IT can deploy a shortcut using its normal Windows tools.

The password is never saved. The session token is encrypted with the OS credential
storage in Electron's user-data folder; if encryption/storage is unavailable the
session is kept only in memory. Expired sessions require another sign-in. The
renderer has no Node access or token access; all API calls use a restricted IPC
bridge in the main process. Server addresses accept HTTP(S) origins only.

## Development and packaging

Requires Node.js 22.12+ and npm. From this directory:

```sh
npm ci
npm start
npm test
npm run test:ui
npm run build:win
```

`build:win` produces an unsigned Windows x64 ZIP in `dist/`. Windows signing is
not configured; organizations can sign/deploy it through their own process.
`npm run build:mac` produces an unpacked macOS app for local verification.
UI smoke tests use fixture data only and do not submit production tickets.
Verify the Windows executable and desktop hover behavior on a Windows PC before
organization-wide rollout. Build output and dependencies are excluded from Git.
