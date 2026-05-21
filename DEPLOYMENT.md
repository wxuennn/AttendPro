# AttendPro Deployment Guide

## Can I Publish It On GitHub?

Yes. GitHub is good for storing and sharing the project code with your group members.

Do not use GitHub Pages for the final shared attendance system because GitHub Pages only hosts static files. AttendPro needs `server.js` running so all devices can use the same shared dataset.

## Will Dataset Sync From GitHub?

No. GitHub does not run the live app database.

Dataset sync works only when every device opens the same running AttendPro server URL.

Good:

```text
Admin computer -> https://your-attendpro-app.example.com
Employee phone -> https://your-attendpro-app.example.com
QR display     -> https://your-attendpro-app.example.com/?display=qr
```

Not shared:

```text
Person A opens their own localhost
Person B opens another localhost
```

Those are separate computers, so their data will not sync.

## Recommended Setup For Coursework

Use this structure:

1. GitHub repository: stores code for group members and submission.
2. Online Node.js hosting: runs `server.js` and keeps the live dataset.
3. One public HTTPS URL: used by admin, employees, phones, and QR display.

Start command:

```bash
npm start
```

Environment variables:

```text
PORT=4173
DATA_DIR=/path/to/persistent/data
```

If the hosting platform provides its own port, leave `PORT` empty and it will be supplied automatically.

`DATA_DIR` should point to persistent storage if the host supports it. Without persistent storage, the app may lose dataset files when the host restarts.

## Files To Push To GitHub

Push the source files:

```text
index.html
app.js
styles.css
server.js
package.json
manifest.json
sw.js
qrcode.min.js
README.md
DEPLOYMENT.md
docs/
```

Do not push runtime/private files:

```text
attendpro-data*.json
*.log
cloudflared.exe
AttendPro Public Website.url
AttendPro Public Website.html
```

These are already listed in `.gitignore`.

## Production Notes

The current project uses JSON files for dataset storage. This is acceptable for a coursework prototype and demo.

For a real company production system, use a database such as PostgreSQL, MySQL, Supabase, Firebase, or MongoDB. The important rule is the same: every device must connect to the same hosted backend.
