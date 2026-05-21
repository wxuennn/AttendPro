# AttendPro Deployment Checklist

Use this file when deploying AttendPro from GitHub to a public server.

## What GitHub Does

GitHub stores the project source code.

GitHub does not:

- run `server.js`
- store live company attendance data
- sync users by itself

For live sync, deploy the project as a Node.js web app.

## Option 1: Render

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

## Option 2: Railway

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

## Do Not Use GitHub Pages

GitHub Pages cannot run the Node.js server, so AttendPro data sync will not work there.

Use Render, Railway, VPS, or another Node.js hosting provider.
