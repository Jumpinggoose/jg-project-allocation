# JG Project Allocation

Internal JUMPINGGOOSE project and team allocation app.

## Current architecture

- Frontend: static HTML/CSS/JavaScript
- Hosting target: Vercel
- Authentication: Supabase Auth
- Shared data: Supabase Postgres
- Region: Mumbai (ap-south-1)
- Repository: private

## Deploy

See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

## Data model

The shared application state is stored in `public.app_state` with Row Level Security enabled. Only authenticated users can read or update the workspace.

## Security

The repository contains only the Supabase publishable browser key. Never commit a Supabase service-role or secret key.

## Migrating the current local app data

Export a complete JSON backup from the local app, sign into the Vercel version, then use **Data → Import backup**. This makes Supabase the shared master copy.
