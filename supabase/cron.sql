-- Run once in the Supabase SQL editor after setting BUDDY_CRON_SECRET in Edge Function secrets.
-- Replace both placeholders below. Never commit a real secret to this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('https://PROJECT_REF.supabase.co', 'buddy_project_url');
select vault.create_secret('PASTE_THE_SAME_RANDOM_CRON_SECRET', 'buddy_cron_secret');

-- pg_cron uses GMT: 06, 09, 12, 15, 18 UTC = 10, 13, 16, 19, 22 Mauritius.
select cron.schedule('buddy-monthly-reminders', '0 6,9,12,15,18 3 * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'buddy_project_url') || '/functions/v1/buddy-reminders/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'buddy_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);
