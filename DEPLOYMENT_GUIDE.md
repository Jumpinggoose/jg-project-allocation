# Browser-only deployment guide

## 1. Upload this folder to the private GitHub repository

Upload the **contents** of this folder to the repository root. Do not upload the enclosing folder or ZIP as one file.

Commit message:

`Add cloud-ready JG allocation app v1.4`

Confirm that `data.json` and any exported backup are not present in the repository.

## 2. Prepare the account JSON

Open `USER_ACCOUNTS_TEMPLATE.json` on your computer and create one record per approved person.

Use:

- `admin` for application owners
- `editor` for people who can change projects
- `viewer` for read-only access

Use a different strong password for every person. Copy the complete JSON after editing it, but do not upload the edited account file to GitHub.

## 3. Create the Render Blueprint

1. Sign in to Render.
2. Select **New → Blueprint**.
3. Connect the private `jg-project-allocation` GitHub repository.
4. Keep the Blueprint path as `render.yaml`.
5. When Render asks for `JG_USERS_JSON`, paste the complete account JSON.
6. Review the paid `0.5c-512mb` web service and the 1 GB persistent disk.
7. Select **Deploy Blueprint**.

Render will provide an HTTPS address similar to:

`https://jg-project-allocation.onrender.com`

## 4. Verify before importing live data

1. Open the Render address in an incognito/private browser window.
2. Confirm that the login screen appears.
3. Sign in with the administrator account.
4. Confirm Dashboard, Pond 1, Pond 2, Team Overview and Team Setup open correctly.
5. Confirm an unapproved email cannot sign in.

## 5. Import the current app backup

1. In the local app, use **Data → Export complete backup**.
2. In the hosted app, sign in as Admin or Editor.
3. Use **Data → Import backup**.
4. Select the exported JSON file.
5. Confirm the projects and team information appear on a second authorised device.

## 6. Ongoing updates

To publish a later code update, replace the relevant files in GitHub and commit the change. Render will redeploy automatically. The live `data.json`, rotating backups and audit log remain on the persistent disk and are not replaced by GitHub code updates.

Always export a complete backup before a significant update.
