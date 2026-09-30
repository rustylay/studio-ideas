import { shortStamp, fitDimensions, ideasToMarkdown, imageFileName, markdownFileName,
         uniqueFileName, noteSubject } from './lib.js';
import { loadIdeas, saveIdeas, putImage, getImage, deleteImages,
         loadNotes, saveNotes } from './store.js';

const $ = s => document.querySelector(s);
const els = {
  title: $('#title'), description: $('#description'), with: $('#with'),
  save: $('#save'), list: $('#list'), heading: $('#heading'), toast: $('#toast'),
  addImage: $('#addImage'), images: $('#images'), thumbs: $('#thumbs'),
  takePhoto: $('#takePhoto'), camera: $('#camera'),
  share: $('#share'), clear: $('#clear'), fallback: $('#fallback'),
  bar: $('#bar'), back: $('#back'), home: $('#home'), ideaView: $('#ideaView'),
  noteView: $('#noteView'), goIdea: $('#goIdea'), goNote: $('#goNote'),
  noteText: $('#noteText'), saveNote: $('#saveNote'), noteList: $('#noteList'),
  noteHeading: $('#noteHeading'),
};

let ideas = loadIdeas();
let openId = null;

function say(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 1600);
}

function escapeHtml(s){
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}

// A 4MB phone photo becomes roughly 250KB at these settings. That is the whole
// point: full-size images are what would push this app into storage eviction.
const MAX_EDGE = 1600, JPEG_QUALITY = 0.8;

function downscale(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, MAX_EDGE);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('canvas produced no blob')),
        'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

// Images attached to the idea being written, before it is saved.
let pendingImages = [];

// One malformed record must not take the rest of the list with it: loadIdeas
// validates only that the top level is an array, so every read of `images`
// goes through here.
function imagesOf(idea){
  return Array.isArray(idea && idea.images) ? idea.images : [];
}

function renderThumbs(){
  els.thumbs.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const fig = document.createElement('figure');
    fig.innerHTML = `<img src="${img.url}" alt="">
      <button type="button" aria-label="Remove image">×</button>`;
    fig.querySelector('button').addEventListener('click', () => {
      URL.revokeObjectURL(img.url);
      pendingImages.splice(i, 1);
      renderThumbs();
    });
    els.thumbs.appendChild(fig);
  });
}

// Two ways in, because they are two different moments: a sketch or a thing just
// seen is a camera moment, a screenshot or an older photo is a gallery moment.
// One picker in between would tax both.
els.takePhoto.addEventListener('click', () => els.camera.click());
els.addImage.addEventListener('click', () => els.images.click());

async function attach(input){
  for (const file of input.files){
    try {
      const blob = await downscale(file);
      const key = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingImages.push({ key, blob, url: URL.createObjectURL(blob) });
    } catch {
      say('Could not read that image');
    }
  }
  input.value = '';
  renderThumbs();
}

els.camera.addEventListener('change', () => attach(els.camera));
els.images.addEventListener('change', () => attach(els.images));

// Only the title gates Save. Everything else is optional by design.
function syncSaveButton(){ els.save.disabled = !els.title.value.trim(); }
els.title.addEventListener('input', syncSaveButton);

// #title advertises enterkeyhint="next"; this is what makes that true.
els.title.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); els.description.focus(); }
});

els.save.addEventListener('click', async () => {
  const title = els.title.value.trim();
  if (!title) return;
  els.save.disabled = true;
  const keys = [];
  try {
    for (const img of pendingImages){
      await putImage(img.key, img.blob);
      keys.push(img.key);
    }
  } catch {
    // Storage can fail mid-write; the idea the user just typed must survive the
    // failure, so leave the fields and pendingImages alone and let them retry Save.
    if (keys.length) deleteImages(keys).catch(() => {});
    say('Could not save — try again');
    syncSaveButton();
    return;
  }
  const record = {
    id: Date.now(), ts: Date.now(), title,
    description: els.description.value.trim(),
    with: els.with.value.trim(),
    images: keys, exported: false,
  };
  ideas.unshift(record);
  try {
    saveIdeas(ideas);
  } catch {
    // localStorage can refuse the write under quota pressure. Unwind completely:
    // take the record back out, drop the blobs it would have referenced, and
    // leave the typed idea on screen so Save can be tried again.
    ideas.shift();
    if (keys.length) deleteImages(keys).catch(() => {});
    say('Could not save — try again');
    syncSaveButton();
    return;
  }
  pendingImages.forEach(img => URL.revokeObjectURL(img.url));
  pendingImages = [];
  els.title.value = ''; els.description.value = ''; els.with.value = '';
  renderThumbs(); syncSaveButton(); render(); say('Saved'); els.title.focus();
});

function render(){
  const pending = ideas.filter(i => !i.exported).length;
  els.heading.textContent = ideas.length ? `Saved · ${pending} not yet shared` : 'Saved';
  els.list.innerHTML = '';
  if (!ideas.length){
    els.list.innerHTML = '<li class="empty">Nothing yet. Dictate or type above.</li>';
    return;
  }
  for (const idea of ideas){
    const li = document.createElement('li');
    li.className = idea.id === openId ? '' : 'collapsed';
    const who = idea.with ? ` · with ${escapeHtml(idea.with)}` : '';
    const count = imagesOf(idea).length;
    const pics = count ? ` · ${count} image${count > 1 ? 's' : ''}` : '';
    li.innerHTML = `
      <div class="meta">
        <span class="dot ${idea.exported ? 'sent' : ''}"></span>
        <span>${shortStamp(idea.ts)}${idea.exported ? ' · shared' : ''}${who}${pics}</span>
      </div>
      <div class="idea-title">${escapeHtml(idea.title)}</div>
      ${idea.description ? `<div class="idea-body">${escapeHtml(idea.description)}</div>` : ''}`;
    li.addEventListener('click', () => {
      openId = openId === idea.id ? null : idea.id;
      render();
    });
    els.list.appendChild(li);
  }
}

// Assemble the markdown plus every image file for the ideas being shared.
// Image filenames carry the idea's title so they stay recognisable a year later.
// A single image that fails to read from storage (missing or a genuine IndexedDB
// error) is skipped rather than aborting the whole export — the idea's text must
// still go out even if one of its pictures is gone.
// Says what happened and leaves it on screen, with the text to copy by hand.
function notice(message, markdown){
  els.fallback.hidden = false;
  els.fallback.querySelector('h2').textContent = message;
  els.fallback.querySelector('textarea').value = markdown;
}

async function buildPayload(items){
  const files = [];
  const withNames = [];
  // Owned for the length of one export: two ideas sharing a title on the same
  // day would otherwise put two identically named files in one bundle.
  const usedNames = new Set();
  const withImages = [];
  for (const idea of items){
    const names = [];
    const keys = imagesOf(idea);
    for (let n = 0; n < keys.length; n++){
      let blob;
      try {
        blob = await getImage(keys[n]);
      } catch {
        continue;
      }
      if (!blob) continue;
      // Numbered by what actually goes out, not by position: a picture whose
      // data has vanished should not leave a gap in the sequence.
      const name = uniqueFileName(imageFileName(idea.ts, idea.title, names.length + 1), usedNames);
      names.push(name);
      files.push(new File([blob], name, { type: 'image/jpeg' }));
    }
    if (names.length) withImages.push(idea);
    withNames.push({ ...idea, imageNames: names });
  }
  const imageCount = files.length;
  const markdown = ideasToMarkdown(withNames);
  const fileName = markdownFileName(Date.now());
  // text/plain, not text/markdown: Chrome's Web Share file-type allowlist is
  // conservative, and one disallowed member makes canShare({files}) false for
  // the whole set — which is how every photo used to end up on the clipboard
  // path and be dropped. The .md filename is what matters on the laptop.
  files.unshift(new File([markdown], fileName, { type: 'text/plain' }));
  return { markdown, fileName, files, imageCount, withImages };
}

// Ordered by preference. A GitHub destination gets added here later and nothing
// else in the app has to change.
//
// `carriesFiles` is stated by each destination, never inferred from what it does.
// It is the single fact that decides whether the ideas it sent can be marked
// shared: a destination that carries only text leaves the photos behind, and an
// idea marked shared is an idea "Clear shared" is allowed to delete.
const DESTINATIONS = [
  {
    name: 'share sheet',
    carriesFiles: true,
    available: p => !!(navigator.canShare && navigator.canShare({ files: p.files })),
    send: async p => { await navigator.share({ files: p.files, title: p.fileName }); },
  },
  {
    name: 'clipboard',
    carriesFiles: false,
    available: () => !!(navigator.clipboard && window.isSecureContext),
    send: async p => {
      await navigator.clipboard.writeText(p.markdown);
      say('Copied as markdown');
    },
  },
  {
    name: 'download',
    carriesFiles: true,
    available: () => true,
    send: async p => {
      for (const file of p.files){
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      say('Saved to Downloads');
    },
  },
];

// Which of the ideas just sent may be marked shared. A destination that cannot
// carry files sent the markdown and nothing else, so any idea whose photos were
// in that bundle has not really left the phone — marking it shared would let
// "Clear shared" destroy the only copy of a picture the markdown still names.
function markShared(dest, payload, items){
  if (dest.carriesFiles || !payload.imageCount){
    items.forEach(i => { i.exported = true; });
    return { held: 0 };
  }
  const held = new Set(payload.withImages);
  items.forEach(i => { if (!held.has(i)) i.exported = true; });
  return { held: payload.imageCount };
}

els.share.addEventListener('click', async () => {
  const pending = ideas.filter(i => !i.exported);
  const items = pending.length ? pending : ideas;
  if (!items.length){ say('Nothing to share'); return; }

  els.fallback.hidden = true;
  els.share.disabled = true;
  try {
    let payload;
    try {
      payload = await buildPayload(items);
    } catch {
      // Building the payload itself failed (e.g. storage threw). The ideas are
      // still safe on disk — just tell Rusty rather than leaving him guessing.
      say('Could not share');
      return;
    }
    for (const dest of DESTINATIONS){
      if (!(await dest.available(payload))) continue;
      try {
        await dest.send(payload);
        const { held } = markShared(dest, payload, items);
        try {
          saveIdeas(ideas);
        } catch {
          // The export went out but the phone could not record that it did.
          // Nothing is lost — the ideas are still here and can be shared again.
          say('Shared, but could not record it — share again later');
          return;
        }
        render();
        if (dest.name === 'share sheet'){
          say('Shared');
        } else {
          // A toast lasts under two seconds and is missable. A degraded path is
          // exactly what Rusty has to know about, so it stays on screen.
          notice(held
            ? `The share sheet was not available, so this went out as ${dest.name}. `
              + `Text only — ${held} image${held > 1 ? 's' : ''} stayed on this phone.`
            : `The share sheet was not available, so this went out as ${dest.name}.`,
            payload.markdown);
        }
        return;
      } catch (err){
        // A cancelled share sheet, or a denied permission, is Rusty saying no.
        // Trying the next destination would be routing around his answer — and
        // that is exactly how a denied clipboard ended up silently marking two
        // ideas shared through a fallback he never saw.
        if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')){
          say('Not shared — nothing left the phone');
          return;
        }
        // A genuine failure: fall through and try the next destination.
      }
    }
    say('Could not share');
  } finally {
    els.share.disabled = false;
  }
});

els.clear.addEventListener('click', async () => {
  const shared = ideas.filter(i => i.exported);
  if (!shared.length){ say('Nothing shared yet'); return; }
  const n = shared.length;
  if (!confirm(`Remove ${n} shared idea${n > 1 ? 's' : ''} from this phone?`)) return;

  // Records first, blobs second. If the write fails nothing has been destroyed;
  // if the delete fails the leftover blobs are merely unreferenced. The other
  // order can leave a record pointing at a picture that no longer exists.
  const keys = shared.flatMap(imagesOf);
  const kept = ideas.filter(i => !i.exported);
  try {
    saveIdeas(kept);
  } catch {
    say('Could not clear — try again');
    return;
  }
  ideas = kept;
  els.fallback.hidden = true;
  render();
  try {
    await deleteImages(keys);
  } catch {
    say('Cleared — some image data is still taking up space');
  }
});

// ---- Notes -----------------------------------------------------------------
// Reminders and quick thoughts: text only, kept on the phone, and never part of
// the ideas pipeline. A note is finished when it is deleted; Send hands the text
// to the phone's share sheet so it can go by email or anywhere else.

let notes = loadNotes();
let openNoteId = null;

function syncSaveNote(){ els.saveNote.disabled = !els.noteText.value.trim(); }
els.noteText.addEventListener('input', syncSaveNote);

els.saveNote.addEventListener('click', () => {
  const text = els.noteText.value.trim();
  if (!text) return;
  const record = { id: Date.now(), ts: Date.now(), text };
  notes.unshift(record);
  try {
    saveNotes(notes);
  } catch {
    // Leave the typed note on screen so Save can be tried again.
    notes.shift();
    say('Could not save — try again');
    return;
  }
  els.noteText.value = '';
  syncSaveNote(); renderNotes(); say('Saved');
  // Drop the keyboard so the list underneath is visible.
  els.noteText.blur();
});

async function sendNote(note){
  const data = { title: noteSubject(note.text), text: note.text };
  if (navigator.share){
    try {
      await navigator.share(data);
      return;
    } catch (err){
      if (err && err.name === 'AbortError'){ say('Not sent'); return; }
      // A genuine failure: fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(note.text);
    say('Copied');
  } catch {
    say('Could not send');
  }
}

function deleteNote(note){
  if (!confirm('Delete this note?')) return;
  const kept = notes.filter(n => n.id !== note.id);
  try {
    saveNotes(kept);
  } catch {
    say('Could not delete — try again');
    return;
  }
  notes = kept;
  renderNotes();
}

function renderNotes(){
  els.noteHeading.textContent = notes.length ? `Notes · ${notes.length}` : 'Notes';
  els.noteList.innerHTML = '';
  if (!notes.length){
    els.noteList.innerHTML = '<li class="empty">Nothing yet. Tap above and dictate.</li>';
    return;
  }
  for (const note of notes){
    const open = note.id === openNoteId;
    const li = document.createElement('li');
    li.className = open ? '' : 'collapsed';
    li.innerHTML = `
      <div class="meta"><span>${shortStamp(note.ts)}</span></div>
      <div class="note-text">${escapeHtml(note.text)}</div>
      ${open ? `<div class="note-actions">
        <button type="button" data-act="send">Send</button>
        <button type="button" class="quiet" data-act="delete">Delete</button>
      </div>` : ''}`;
    li.addEventListener('click', e => {
      const act = e.target.closest('button') && e.target.closest('button').dataset.act;
      if (act === 'send'){ sendNote(note); return; }
      if (act === 'delete'){ deleteNote(note); return; }
      openNoteId = open ? null : note.id;
      renderNotes();
    });
    els.noteList.appendChild(li);
  }
}

// ---- Which screen -----------------------------------------------------------
// The opening screen is the bare URL; each of the other two is a hash, so the
// phone's own Back button steps from a screen to the opening one instead of
// leaving the app.

let shown = null;
let pushed = false;   // true once we have added a history entry ourselves

function apply(){
  const view = location.hash === '#idea' ? 'idea' : location.hash === '#note' ? 'note' : 'home';
  els.home.hidden = view !== 'home';
  els.back.hidden = view === 'home';
  els.ideaView.hidden = view !== 'idea';
  els.noteView.hidden = view !== 'note';
  // Idea capture used to open with the title focused; keep that. Notes wait for a
  // tap on the field, as asked.
  if (view === 'idea' && shown !== 'idea') els.title.focus();
  shown = view;
}

function go(view){ pushed = true; location.hash = view; }
els.goIdea.addEventListener('click', () => go('idea'));
els.goNote.addEventListener('click', () => go('note'));
els.back.addEventListener('click', () => {
  if (pushed){ history.back(); return; }
  // Landed straight on a screen (a reload, say): no entry of ours to step back to.
  history.replaceState(null, '', location.pathname + location.search);
  apply();
});
window.addEventListener('hashchange', apply);

renderNotes();
apply();

render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
