# AttendPro Deployment Checklist

Use this file when deploying AttendPro from GitHub to a public server.

## What GitHub Does

GitHub stores the project source code.

GitHub does not:

- run `server.js`
- store live company attendance data
- sync users by itself

For live sync, use one shared backend.

Free sync option:

```text
GitHub Pages + Firebase Realtime Database
```

Node server option:

```text
Render / Railway / VPS
```

## Option 1: Free GitHub Pages + Firebase

These steps are for the project owner only. Normal users do not need to edit code, push to GitHub, or deploy anything.

1. Create a Firebase project on the free Spark plan.
2. Create a Realtime Database.
3. Copy the Realtime Database URL.
4. Edit `firebase-config.js`.
5. Set:

```js
window.ATTENDPRO_FIREBASE = {
  enabled: true,
  databaseURL: "PASTE_YOUR_FIREBASE_DATABASE_URL_HERE"
};
```

6. Commit and push `firebase-config.js`.
7. In GitHub, open repository `Settings`.
8. Open `Pages`.
9. Choose `Deploy from a branch`.
10. Branch: `main`.
11. Folder: `/root`.
12. Save.
13. Use the generated GitHub Pages URL for all admins and employees.

This is free and supports shared sync through Firebase.

After this is done, normal users only open the GitHub Pages URL and login with the company dataset, dataset password, email, and password.

## Option 2: Render

Use the Render deploy button in `README.md`, or open this link:

```text
https://render.com/deploy?repo=https://github.com/wxuennn/AttendPro
```

Render will read `render.yaml` and create the web service with persistent dataset storage.

### Render Steps

Recommended for easiest deployment.

1. Push the latest code to GitHub.
2. Open Render.
3. Sign in with GitHub.
4. Click `New`.
5. Choose `Blueprint`.
6. Select the AttendPro repository.
7. Render reads `render.yaml`.
8. Confirm the service.
9. Wait for deployment to complete.
10. Copy the real Render URL.
11. Give that URL to all admins and employees.

Included Render settings:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
Persistent Disk Mount Path: /var/data
Environment Variable: DATA_DIR=/var/data
```

## Option 3: Railway

1. Push the latest code to GitHub.
2. Open Railway.
3. Create `New Project`.
4. Choose `Deploy from GitHub repo`.
5. Select the AttendPro repository.
6. Confirm Node.js deployment.
7. Set start command:

```bash
npm start
```

8. Add a volume.
9. Mount the volume at:

```text
/app/data
```

10. Add environment variable:

```text
DATA_DIR=/app/data
```

11. Deploy.
12. Copy the real Railway URL.
13. Give that URL to all admins and employees.

## After Deployment

1. Open the deployed URL.
2. Select `Admin`.
3. Enter a new company dataset name.
4. Enter a dataset password.
5. Enter the first admin email and password.
6. Login to create the company dataset.
7. Configure Company Settings.
8. Add employee accounts.
9. Share the same URL, dataset name, and dataset password with users.

## GitHub Pages Note

GitHub Pages can be used only with Firebase sync enabled in `firebase-config.js`.

GitHub Pages cannot run `server.js`, so do not use GitHub Pages for the Node server version. Use Render, Railway, VPS, or another Node.js hosting provider if you want to run `server.js`.
