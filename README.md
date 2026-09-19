# Buddy

Buddy · Tax Forecast is a monthly income and Mauritius tax forecast app.

A plain HTML, CSS and JavaScript PWA for Mauritius income tax planning (income year July 2026–June 2027). No build step or package installation is required.

## Run locally

From this folder, run `python3 -m http.server 8000` and visit `http://localhost:8000`. Install the PWA from your browser if supported. Hosting it requires HTTPS for offline service worker use, except on localhost.

The project ZIP contains `.gitignore` at its root with the single line `.DS_Store`.

## Data

Income sources, monthly entries, amounts set aside and EUR conversion rates are stored locally in this browser. Existing PAYE Planner entries load automatically when Buddy is installed at the same address, and earlier JSON backups can still be imported. A salary source can have a basic monthly salary; each month uses it unless you enter a different amount. Confirming a month records its salary amount so changing the source's basic salary later will not rewrite confirmed months. Set a general EUR → MUR rate in Settings. A source, income month or savings record can use a custom rate; clearing a rate field restores its applicable default. Rates that have not been explicitly overridden follow changes to the general setting.

Each month can record an amount set aside in MUR or EUR. Buddy shows both currency equivalents using that savings record's EUR → MUR override or the general rate. **Saved so far** totals savings from July through the current month in both currencies; a future entry remains visible in its month but is excluded until that month arrives. Savings are reserves only: they do not reduce PAYE, projected tax or the projected year-end balance.

In a future month, entering **0** income carries zero into following forecast months until you enter a new positive amount. Clearing an income field removes that month's override: salary returns to its configured basic amount or the latest explicit zero, while freelance forecasts use the nearest earlier entered amount, including zero. A salary month's positive override applies only to that month; later salary months return to the configured basic amount.

Use **Settings → Export JSON** to make a backup and **Import JSON** to restore it. Imported data replaces the current data.

## Optional monthly reminders

After the one-time Supabase setup below, Settings has a single **Enable notifications** switch. On the **3rd of each calendar month**, the first push is sent at 10:00 Mauritius time even if the month is already recorded. At 13:00, 16:00, 19:00 and 22:00, a push is sent only when that calendar month still has no recorded entry. A confirmed salary default or an explicitly entered 0 counts; a forecast, a carried-forward value and an empty field do not. Buddy chooses from the ten approved messages at random, avoiding the previous message on that device. The notification opens Buddy.

Buddy continues to store all income, PAYE and currency amounts only on the device. Supabase receives a browser push subscription and a yes/no recorded status for the current calendar month. The notification setting and anonymous device token stay on the current browser and are not in the JSON backup. Each installation has independent reminders. A recorded month saved offline will sync when the app next opens online; a later push may arrive before it syncs. The switch works only on HTTPS. On iPhone, add Buddy to the Home Screen and open the installed app before enabling notifications.

### One-time Supabase setup (developer)

1. Create a Supabase project. Run `supabase/migrations/20260917_buddy_reminders.sql` in its SQL editor (or apply it as a migration). The tables have RLS enabled and no public policies.
2. Run `node scripts/generate-reminder-keys.mjs` locally. In the Supabase Dashboard, set the generated `BUDDY_VAPID_KEYS` JSON and `BUDDY_CRON_SECRET` as **Edge Function secrets**. Also set `BUDDY_ORIGIN` to Buddy's exact HTTPS origin, for example `https://buddy.example.com`. Keep these values out of the website, ZIP and Git; `.gitignore` intentionally contains only `.DS_Store`.
3. From the project folder, link the CLI to the project and deploy: `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase functions deploy buddy-reminders`. `supabase/config.toml` selects the function entrypoint and disables the gateway JWT check; the function separately validates device tokens and the cron secret. The server code requires no credentials in the browser.
4. Set the project function URL in `reminder-config.js`, for example `https://YOUR_PROJECT_REF.supabase.co/functions/v1/buddy-reminders`. This is a public URL, not a secret. Upload the updated website over HTTPS.
5. In the Supabase SQL editor, fill the two placeholders in `supabase/cron.sql` and run it once. Use the **same cron secret** from step 2. Supabase Cron calls the function at 06:00, 09:00, 12:00, 15:00 and 18:00 GMT on the 3rd, corresponding to 10:00, 13:00, 16:00, 19:00 and 22:00 in Mauritius. Check the Cron history and Edge Function logs after the first scheduled run.

The PWA works offline without reminders if Supabase has not yet been configured. The notification switch then explains that setup is pending. Do not rotate the VAPID key without asking devices to subscribe again; changing it invalidates existing push subscriptions.

The tax forecast applies the 2026–27 bands linked in the app to the total entered and projected MUR income. Enter basic salary before PAYE, plus any taxable extra pay in months where applicable; omit exempt transport allowance. Monthly tax forecast is an allocation of annual tax for planning; salary PAYE paid or forecast is recorded separately. Review the rules before using it for a later financial year.
