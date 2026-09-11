# Studio Ideas

A single-page app for catching an idea on a phone when you are nowhere near a computer,
and getting it back to the desk intact.

Type or dictate a title. Add a paragraph, who the idea is with, and a photo if any of
those apply — none of them are required. Everything stays on the phone until you tap
Share, which sends one markdown file plus any images to wherever you want them.

Install it by opening the page in Chrome on Android and choosing **Install app** from the
menu. It works with no signal.

Nothing is uploaded anywhere. Your ideas live in your own browser's storage and leave it
only when you share them yourself.

## Files

| File | What it does |
|---|---|
| `index.html` | the page itself — markup and styles |
| `lib.js` | timestamps, filenames, and the markdown the app exports |
| `store.js` | keeps ideas in local storage and photos in IndexedDB |
| `app.js` | the screen: capturing, listing, sharing |
| `sw.js` | lets the installed app open without a connection |

No build step, no dependencies, no server.
