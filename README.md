# Buddy

Buddy · Tax Forecast is a monthly income and Mauritius tax forecast app.

A plain HTML, CSS and JavaScript PWA for Mauritius income tax planning (income year July 2026–June 2027). No build step or package installation is required.

## Run locally

From this folder, run `python3 -m http.server 8000` and visit `http://localhost:8000`. Install the PWA from your browser if supported. Hosting it requires HTTPS for offline service worker use, except on localhost.

The project ZIP contains `.gitignore` at its root with the single line `.DS_Store`.

## Data

Income sources, monthly entries and EUR conversion rates are stored locally in this browser. Existing PAYE Planner entries load automatically when Buddy is installed at the same address, and earlier JSON backups can still be imported. A salary source can have a basic monthly salary; each month uses it unless you enter a different amount. Confirming a month records its salary amount so changing the source's basic salary later will not rewrite confirmed months. Set a general EUR → MUR rate in Settings. A source can use a custom rate, and an individual month can override that source's rate; clearing the rate field in either editor restores its default. Rates that have not been explicitly overridden follow changes to the general setting.

In a future month, entering **0** income carries zero into following forecast months until you enter a new positive amount. Clearing an income field removes that month's override: salary returns to its configured basic amount or the latest explicit zero, while freelance forecasts use the nearest earlier entered amount, including zero. A salary month's positive override applies only to that month; later salary months return to the configured basic amount.

Use **Settings → Export JSON** to make a backup and **Import JSON** to restore it. Imported data replaces the current data.

The tax forecast applies the 2026–27 bands linked in the app to the total entered and projected MUR income. Enter basic salary before PAYE, plus any taxable extra pay in months where applicable; omit exempt transport allowance. Monthly tax forecast is an allocation of annual tax for planning; salary PAYE paid or forecast is recorded separately. Review the rules before using it for a later financial year.
