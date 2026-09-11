// Pure functions. No DOM, no storage, no globals — everything here is asserted
// against from test.html.

export const pad = n => String(n).padStart(2, '0');

export function stampDate(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function stampDateTime(ts){
  const d = new Date(ts);
  return `${stampDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function stampCompact(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function shortStamp(ts, now = Date.now()){
  const d = new Date(ts);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === new Date(now).toDateString()) return `Today ${time}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${time}`;
}

// Lowercase, non-alphanumerics to single hyphens, trimmed, capped at 40 chars.
// Returns '' when nothing usable survives, so callers can fall back.
export function slugify(title){
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function imageFileName(ts, title, n){
  const d = new Date(ts);
  const slug = slugify(title) || `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `ideas-${stampCompact(ts)}-${slug}-${n}.jpg`;
}

export function markdownFileName(ts){
  return `ideas-${stampDate(ts)}.md`;
}

// Two ideas sharing a title on the same day produce the same filename, and two
// files of the same name in one share bundle means one silently overwrites the
// other before anything on the laptop ever sees it. The title-based name is kept;
// a numeric tail is added only when the name is already taken in this bundle.
// `used` is a Set the caller owns for the length of one export.
export function uniqueFileName(name, used){
  if (!used.has(name)){ used.add(name); return name; }
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  for (let n = 2; ; n++){
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate)){ used.add(candidate); return candidate; }
  }
}

// A dictated line can start with '#', and /grab reads a line starting with '##'
// as the beginning of a new idea — one idea would silently become two. A leading
// backslash is markdown's own escape: the text still reads as written, and the
// line is no longer a heading.
export function escapeBody(body){
  return String(body).split('\n')
    .map(line => /^\s{0,3}#/.test(line) ? line.replace('#', '\\#') : line)
    .join('\n');
}

// One idea as a markdown block. Empty fields are omitted entirely rather than
// emitted blank: a blank field invites nothing, which is how `project:` failed.
export function ideaToMarkdown(idea){
  const lines = [`## ${String(idea.title).trim()}`, `captured: ${stampDateTime(idea.ts)}`];
  const who = String(idea.with || '').trim();
  if (who) lines.push(`with: ${who}`);
  const names = idea.imageNames || [];
  if (names.length) lines.push(`images: ${names.join(', ')}`);
  const body = String(idea.description || '').trim();
  let out = lines.join('\n') + '\n';
  if (body) out += `\n${escapeBody(body)}\n`;
  return out;
}

export function ideasToMarkdown(ideas){
  return ideas.map(ideaToMarkdown).join('\n');
}

// Scale to fit within `max` on the long edge. Never upscales.
export function fitDimensions(w, h, max){
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
