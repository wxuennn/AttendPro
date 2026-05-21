# AttendPro Employee Attendance System

AttendPro is a web-based employee attendance system for computer and phone. It supports admin management, employee check-in/out, GPS verification, rotating QR/code check-in, work requests, monthly calendars, audit logs, and multi-company datasets.

GitHub stores the source code. To make all users share the same live data, the system must run from one shared server URL.

## 1. How Users Should Use The System

For real shared use, all users must open the same deployed public link, for example:

```text
https://your-attendpro-app.onrender.com
```

Use that same link for:

- Admin computer
- Employee phone
- QR display monitor
- Employee QR scan

If different people run their own `localhost`, their data will not sync.

## 2. First-Time Company Setup

The system starts with no employees.

To create a company dataset:

1. Open the AttendPro website.
2. Select `Admin`.
3. Enter a new `Company Dataset`, for example `abc-company`.
4. Enter a `Dataset Password`.
5. Enter the first admin email and password.
6. Click `Login`.

The system will create a new empty company dataset.

After login, the admin should:

1. Go to `Company Settings`.
2. Set company name, office location, GPS radius, working days, late time, and QR/code refresh time.
3. Go to `Employees`.
4. Add employee accounts.

Employees can then login using:

- Same `Company Dataset`
- Same `Dataset Password`
- Their own employee email and password

## 3. Local Demo On One Computer

If you downloaded this project folder on Windows:

1. Double-click `Open AttendPro.vbs`.
2. The server starts in the background.
3. The browser opens automatically.
4. Use `Stop AttendPro Server.vbs` when finished.

The launcher can also create a temporary Cloudflare public link for phone testing. The link is written to:

```text
AttendPro Public Website.url
AttendPro Public Website.html
```

Cloudflare quick links may change every time the launcher is restarted.

## 4. Deploy Online With Render

Recommended for coursework sharing.

1. Push this repository to GitHub.
2. Go to Render.
3. Create `New` -> `Blueprint`.
4. Connect this GitHub repository.
5. Render will read `render.yaml`.
6. Deploy the service.
7. Use the Render URL as the official AttendPro link.

Render runs:

```bash
npm start
```

The included `render.yaml` uses persistent disk storage at:

```text
/var/data
```

That is where company dataset files are stored on Render.

## 5. Deploy Online With Railway

1. Create a Railway project from this GitHub repository.
2. Use start command:

```bash
npm start
```

3. Add a Railway volume.
4. Set environment variable:

```text
DATA_DIR=/app/data
```

5. Use the generated Railway URL as the official AttendPro link.

## 6. Important Sync Rule

Data sync works only when every user opens the same running server URL.

Works:

```text
Admin -> https://same-app-url
Employee -> https://same-app-url
Phone QR -> https://same-app-url
```

Does not sync:

```text
Admin -> localhost on one computer
Employee -> localhost on another computer
```

## 7. Main Files

```text
index.html       Main page
app.js           Frontend application logic
styles.css       User interface styling
server.js        Node.js server and dataset API
package.json     Node.js start command
render.yaml      Render deployment setup
README.md        User and deployment guide
DEPLOYMENT.md    Short deployment notes
```

Runtime/private files are excluded by `.gitignore`:

```text
attendpro-data*.json
*.log
cloudflared.exe
AttendPro Public Website.url
AttendPro Public Website.html
```

## 8. Security Notes

- Each company dataset needs a dataset password.
- Dataset files cannot be opened directly from the browser.
- QR/code check-in requires GPS verification inside the company office radius.
- Employee status changes and attendance deletion require admin remarks and are stored in Audit Log.

## 9. Production Note

This project uses JSON files for coursework/demo storage. For a real company production system, replace JSON storage with a proper database such as PostgreSQL, MySQL, Supabase, Firebase, or MongoDB.
