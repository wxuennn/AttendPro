# AttendPro - Employee Attendance System

AttendPro is a browser-based employee attendance system for the TSE6223 Software Engineering Fundamentals project. It supports employee and admin workflows, QR/code check-in, GPS office verification, work requests, monthly calendars, CSV/report export, and multi-company datasets.

## Main Features

- Employee login, check in, check out, attendance history, monthly calendar, work request application, and profile update.
- Admin login, employee management, attendance management, work request approval/rejection, company settings, dashboard summary, and audit log.
- Multi-company dataset name plus dataset password.
- A new dataset is created only through an Admin login with a new dataset name and dataset password.
- Empty default dataset: no preloaded employees.
- Rotating QR and manual code check-in with mandatory GPS office radius verification.
- Admin can configure office location, radius, working days, late threshold, QR/code refresh, and employee status.
- Employee status changes and attendance deletion require remarks and are recorded in Audit Log.
- Employee employment date controls calendar history: dates before joining are blank.
- Live sync when all devices use the same running server URL.

## Local / Demo Opening

For one computer, or quick public demo using a temporary Cloudflare link:

1. Double-click `Open AttendPro.vbs`.
2. The server and public tunnel start in the background.
3. The browser opens automatically.
4. Use `Stop AttendPro Server.vbs` when finished.

The generated public link is also written to:

```text
AttendPro Public Website.url
AttendPro Public Website.html
```

Cloudflare quick tunnel links may change each time the launcher is restarted.

## GitHub And Online Sync

GitHub can store the code, but GitHub alone does not sync datasets.

To make computer and phone users share the same attendance data, deploy this as a Node.js web app and let every device open the same public HTTPS URL.

See `DEPLOYMENT.md`.

## Run Command

```bash
npm start
```

## Dataset Security

Each company uses:

- Company Dataset
- Dataset Password

The server rejects dataset access when the password is wrong. Dataset JSON files are also blocked from direct browser download.
