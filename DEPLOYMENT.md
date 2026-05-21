# Deployment Notes

GitHub stores the AttendPro source code. It does not run the live dataset.

For shared computer and phone use, deploy the project as a Node.js app and let every user open the same public URL.

## Render

Use `render.yaml`.

Render settings are already included:

```text
Build Command: npm install
Start Command: npm start
Health Check: /healthz
DATA_DIR: /var/data
Persistent Disk: /var/data
```

## Railway

Use:

```bash
npm start
```

Add a volume and set:

```text
DATA_DIR=/app/data
```

## Important

Do not use GitHub Pages for the final system. GitHub Pages cannot run `server.js`, so dataset sync will not work.
