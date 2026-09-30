# JUMPINGGOOSE Project Allocation — Cloud Build v1.4

This repository contains the browser-based JG project and team allocation application prepared for a managed Render deployment.

## Production features

- Individual email/password accounts configured outside GitHub
- Admin, Editor and Viewer roles
- Shared data stored on a persistent disk
- Atomic file saves and rotating JSON backups
- Revision-conflict protection for overlapping edits
- Basic audit log with the saving user's identity
- Automatic Render deployments after GitHub commits
- No local Terminal or host computer required after deployment

## Important files

- `index.html`, `styles.css`, `app.js` — application interface
- `login.html`, `login.css`, `login.js` — sign-in interface
- `server.py` — authentication, API, shared persistence and backups
- `initial-data.json` — clean 15-member starting setup
- `render.yaml` — Render Blueprint configuration
- `USER_ACCOUNTS_TEMPLATE.json` — local template for preparing account JSON

`data.json` is intentionally excluded. Do not commit a live project backup to GitHub.

## Account roles

- `admin`: can view and edit everything; intended for one or two application owners
- `editor`: can view and edit projects, people and settings
- `viewer`: can view dashboards and export data; server rejects edits

Accounts are supplied to Render through the `JG_USERS_JSON` environment variable. Start from `USER_ACCOUNTS_TEMPLATE.json`, replace every placeholder, and paste the completed JSON into Render. Do not upload the completed account file to GitHub.

## Deployment

Follow `DEPLOYMENT_GUIDE.md` for the browser-only GitHub and Render setup.
