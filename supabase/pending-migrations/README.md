# Pending migrations

Not applied automatically. `0008_solana.sql` clears the Robinhood Chain rows and
renames the market tables for Solana. Move it into `supabase/migrations/` (or
run it in the Supabase SQL editor) once the owner has confirmed the wipe.
