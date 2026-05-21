# Deployment Notes

AttendPro is currently set up for the free sync method:

```text
GitHub Pages + Firebase Realtime Database
```

GitHub Pages hosts the website. Firebase stores and syncs the live company dataset.

## Current Architecture

```text
User browser
  -> GitHub Pages website
  -> Firebase Realtime Database
```

All users must open the same GitHub Pages website link.

## Owner Setup Summary

Only the repository owner needs to do this setup.

1. Create a Firebase project.
2. Create a Firebase Realtime Database.
3. Put the database URL into `firebase-config.js`.
4. Enable GitHub Pages from the `main` branch.
5. Share the GitHub Pages website link with users.

Normal users do not need this file. They only need the official AttendPro website link and their login details.

## Sync Rule

Data sync works because all users connect to the same Firebase Realtime Database.

Do not use separate local `localhost` copies for real shared use.

## Production Note

The current Firebase rules may be open for coursework/demo use. For real production use, configure secure Firebase rules and authentication.
