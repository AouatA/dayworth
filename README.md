# DayWorth

A simple personal to-do tracker that also measures **how valuable your day was**, not just how many
tasks you finished. Every task carries a value from 1–100; the Stats screen charts your daily and
weekly task count *and* total value.

It's a **Progressive Web App**: it runs in the browser, installs to your phone's home screen, works
fully offline, and stores all data locally on your device. No accounts, no server, no cloud.

## Features

- Add / edit / complete / delete tasks
- Value slider (1–100) per task
- Categories, notes, priority
- Due dates with Overdue / Today / Upcoming color states
- Recurring tasks (every N days, or weekly on chosen weekdays)
- Filter by category; sort by smart / due / priority / value
- Stats: today's totals + 7- and 30-day charts of value and task count
- Export / import a JSON backup

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Tech

Plain HTML/CSS/JavaScript (native ES modules, no build step). Data in IndexedDB. Offline via a service
worker + web app manifest. Charts hand-drawn on `<canvas>`.
