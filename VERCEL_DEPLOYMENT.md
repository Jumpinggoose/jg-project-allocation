# JG Project Allocation — Vercel + Supabase

This repository is configured as a static Vercel app backed by Supabase.

## Supabase project
- Project: jg-project-allocation
- Region: ap-south-1 (Mumbai)
- Database: public.app_state
- Authentication: Supabase email/password
- Row Level Security: enabled
- Client uses the Supabase publishable key only. No service-role key is stored in this repository.

## First-time Vercel deployment
1. In Vercel choose **Add New → Project**.
2. Import **Jumpinggoose/jg-project-allocation**.
3. Framework Preset: **Other**.
4. Root Directory: repository root.
5. Build Command: leave empty.
6. Output Directory: leave empty.
7. Install Command: leave empty.
8. Deploy.
9. Open the generated Vercel URL and visit **/login.html**.

No Vercel environment variables are required for this version because the Supabase URL and publishable browser key are intentionally public client configuration.

## Create core-team logins
In Supabase:
1. Open the **jg-project-allocation** project.
2. Go to **Authentication → Users**.
3. Create/invite each approved core-team user.
4. They sign in at `/login.html`.

All authenticated users currently have editor access to the shared workspace.

## Moving current local data into the cloud
1. In the existing local app, use **Data → Export complete backup**.
2. Sign into the Vercel version.
3. Use **Data → Import backup**.
4. Select the JSON backup.
5. The import is saved into Supabase and becomes the shared master copy.

## Updating later
1. Make or upload code changes to the GitHub `main` branch.
2. In Vercel, trigger **Redeploy** manually if auto-deploy is disabled.
3. Project data remains in Supabase and is not replaced by a Vercel deployment.

## Important
Do not add Supabase service-role/secret keys to frontend files or GitHub.
