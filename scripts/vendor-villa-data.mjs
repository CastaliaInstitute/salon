/**
 * Vendor Villa Diodati content from the castalia.institute repo into
 * build-time JSON for the /villa/ replay (see .opencode/specs/villa-3day-replay).
 *
 * Usage: node scripts/vendor-villa-data.mjs
 * Run from the salon repo with castalia.institute checked out as a sibling.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siblingAgenda = resolve(root, '../castalia.institute/villa-diodati/agenda.json');
const siblingCapsule = resolve(root, '../castalia.institute/villa-diodati/journal-capsule.json');

for (const path of [siblingAgenda, siblingCapsule]) {
  if (!existsSync(path)) {
    console.error(`vendor-villa-data: missing ${path}`);
    console.error(
      'Vendor-villa-data needs a local checkout of CastaliaInstitute/castalia.institute as a sibling directory:\n' +
        '  gh repo clone CastaliaInstitute/castalia.institute ../castalia.institute\n' +
        'then re-run: node scripts/vendor-villa-data.mjs'
    );
    process.exit(1);
  }
}

const agenda = JSON.parse(readFileSync(siblingAgenda, 'utf8'));
const capsule = JSON.parse(readFileSync(siblingCapsule, 'utf8'));

// --- schema asserts ---------------------------------------------------------

function assert(condition, message) {
  if (!condition) {
    console.error(`vendor-villa-data: ${message}`);
    process.exit(1);
  }
}

assert(Array.isArray(agenda.days) && agenda.days.length === 3, 'agenda.json must contain exactly 3 days');
assert(agenda.days[0].date === '1816-06-15', `day 1 must be 1816-06-15, got ${agenda.days[0].date}`);
for (const day of agenda.days) {
  assert(Array.isArray(day.entries) && day.entries.length > 0, `day ${day.date} has no entries`);
  for (const entry of day.entries) {
    assert(typeof entry.datetime === 'string', `entry missing datetime in day ${day.date}`);
    assert(typeof entry.scene === 'string' && entry.scene.trim() !== '', `entry ${entry.datetime} has empty scene`);
    assert(typeof entry.mood === 'string' && entry.mood.trim() !== '', `entry ${entry.datetime} has empty mood`);
    assert(Array.isArray(entry.characters) && entry.characters.length > 0, `entry ${entry.datetime} has no characters`);
  }
}

const capsuleWrapper = capsule.villa_diodati_journal_capsule;
assert(capsuleWrapper && Array.isArray(capsuleWrapper.personas), 'journal-capsule.json missing personas');
const personaNames = capsuleWrapper.personas.map((p) => p.name.split('(')[0].trim());
for (const expected of ['Mary', 'Percy', 'Byron', 'Polidori', 'Claire']) {
  assert(personaNames.some((n) => n.includes(expected)), `capsule missing a persona matching ${expected}`);
}

// --- persona matching -------------------------------------------------------

// Token-overlap scoring: "Percy Shelley" must resolve to "Percy Bysshe Shelley",
// not "Mary Wollstonecraft Godwin (Shelley)" whose name also contains 'shelley'.
function personaFor(characterName) {
  const tokens = characterName.toLowerCase().split(/\s+/);
  let best = null;
  let bestScore = 0;
  for (const persona of capsuleWrapper.personas) {
    const personaName = persona.name.toLowerCase();
    const score = tokens.reduce((acc, token) => acc + (personaName.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      best = persona;
      bestScore = score;
    }
  }
  return best;
}

// Every character name used in the agenda must resolve to exactly one persona
// (the replay page performs the same mapping for journal notes).
const agendaCharacters = [...new Set(agenda.days.flatMap((d) => d.entries.flatMap((e) => e.characters)))];
for (const character of agendaCharacters) {
  const persona = personaFor(character);
  assert(persona !== null, `character "${character}" does not resolve to any capsule persona`);
}

// --- scene distillation (authored once, static thereafter) -------------------

// True weekday from the historical date (proleptic Gregorian — matches the
// 1816 Gregorian calendar in use in Geneva). June 15–17, 1816 = Sat/Sun/Mon.
// The October "Fri–Sun" playing windows are the salon-weekend-schedule spec's
// concern, not a property of these historical days.
function weekdayFor(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(1816, m - 1, d)).getUTCDay();
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
}

// Title = first clause of the scene line (word-boundary truncated; terminal period dropped).
function titleFor(sceneText) {
  const firstClause = sceneText.split(/(?<=[.?!;])\s/)[0].replace(/[;.]\s*$/, '');
  if (firstClause.length <= 72) return firstClause;
  const cut = firstClause.slice(0, 72);
  const boundary = cut.lastIndexOf(' ');
  return `${boundary > 0 ? cut.slice(0, boundary) : cut}…`;
}

// Curated per-scene quotes (max 2–3, attributed) to carry the "conversation"
// register where the agenda scene text is terse. Keys are `date/time` in 1816 time.
const QUOTE_PICKS = {
  '1816-06-15/09:00': [
    { character: 'Byron', quote: 'Three days of rain confined us to the house.' },
  ],
  '1816-06-15/20:00': [
    { character: 'Mary Godwin', quote: 'We talked of the experiments of Dr. Darwin, who preserved a piece of vermicelli in a glass case till by some extraordinary means it began to move.' },
  ],
  '1816-06-15/21:00': [
    { character: 'Byron', quote: 'I am as melancholy as a cat in a strange garret.' },
  ],
  '1816-06-16/11:00': [
    { character: 'Polidori', quote: 'Proposed that each should write a tale of terror.' },
  ],
  '1816-06-16/13:00': [
    { character: 'Mary Godwin', quote: 'We talked of the experiments of Dr. Darwin, who preserved a piece of vermicelli in a glass case till by some extraordinary means it began to move.' },
  ],
  '1816-06-16/17:00': [
    { character: 'Percy Shelley', quote: 'The mind in creation is as a fading coal, which some invisible influence, like an inconstant wind, awakens to transitory brightness.' },
  ],
  '1816-06-16/19:00': [
    { character: 'Claire Clairmont', quote: 'He will not look at me, yet I am ever near him.' },
  ],
  '1816-06-16/21:00': [
    { character: 'Polidori', quote: 'Began my story — the nobleman who destroys by fascination.' },
  ],
  '1816-06-16/23:30': [
    { character: 'Mary Godwin', quote: 'When I placed my head on my pillow, I did not sleep, nor could I be said to think; my imagination, unbidden, possessed and guided me.' },
  ],
  '1816-06-17/09:00': [
    { character: 'Percy Shelley', quote: 'The thunderstorm was terrific... The lake was lit up, the pines on Jura made distinct, and the streams of rain seemed like silver wires.' },
  ],
  '1816-06-17/13:00': [
    { character: 'Mary Godwin', quote: 'I saw the pale student of unhallowed arts kneeling beside the thing he had put together.' },
    { character: 'Percy Shelley', quote: 'The mind in creation is as a fading coal, which some invisible influence, like an inconstant wind, awakens to transitory brightness.' },
  ],
  '1816-06-17/15:00': [
    { character: 'Byron', quote: 'There are things which neither poetry nor philosophy can define — but we may attempt them still.' },
  ],
  '1816-06-17/20:30': [
    { character: 'Polidori', quote: 'Began my story — the nobleman who destroys by fascination.' },
    { character: 'Claire Clairmont', quote: 'How glorious it is to be among those who make verses and defy the dull world!' },
  ],
};

function quotesFor(datetime, presentCharacters) {
  const [date, fullTime] = datetime.split('T');
  const time = fullTime.slice(0, 5);
  const picks = QUOTE_PICKS[`${date}/${time}`] ?? [];
  return picks
    .filter((pick) => presentCharacters.includes(pick.character))
    .map((pick) => ({ character: pick.character, quote: pick.quote }));
}

// --- assemble ---------------------------------------------------------------

const location = agenda.location;
const daysRaw = agenda.days.map((day) => ({
  id: `day-${agenda.days.indexOf(day) + 1}`,
  historicDate: day.date,
  weekday: weekdayFor(day.date),
  scenes: day.entries.map((entry) => ({
    time: entry.datetime.slice(11, 16),
    title: titleFor(entry.scene),
    text: `${entry.scene}${entry.notes ? ` ${entry.notes}` : ''}`,
    mood: entry.mood,
    characters: entry.characters,
    quotes: quotesFor(entry.datetime, entry.characters),
  })),
}));

const threeDays = {
  meta: {
    location,
    dateRange: `${daysRaw[0].historicDate} to ${daysRaw[daysRaw.length - 1].historicDate}`,
  },
  days: daysRaw,
};

// Re-assert the output contract before writing (the committed JSON is the contract).
assert(threeDays.days.length === 3, 'three-days.json must contain exactly 3 days');
assert(threeDays.days[0].historicDate === '1816-06-15', 'three-days.json day 1 must be 1816-06-15');
for (const day of threeDays.days) {
  assert(day.weekday, `day ${day.id} missing weekday`);
  for (const scene of day.scenes) {
    assert(typeof scene.time === 'string' && scene.time.trim() !== '', `scene at ${day.id} missing time`);
    assert(typeof scene.title === 'string' && scene.title.trim() !== '', `scene at ${day.id}/${scene.time} missing title`);
    assert(typeof scene.text === 'string' && scene.text.trim() !== '', `scene at ${day.id}/${scene.time} missing text`);
    assert(typeof scene.mood === 'string' && scene.mood.trim() !== '', `scene at ${day.id}/${scene.time} missing mood`);
    assert(Array.isArray(scene.characters) && scene.characters.length > 0, `scene at ${day.id}/${scene.time} missing characters`);
  }
}

const capsuleOut = {
  personas: capsuleWrapper.personas.map((p) => ({
    name: p.name,
    voiceTone: p.voice_tone,
    themes: p.themes,
    motifs: p.motifs,
    quotes: p.quotes,
    journalNotes: p.journal_notes,
  })),
};

mkdirSync(join(root, 'src/data/villa-diodati'), { recursive: true });
writeFileSync(join(root, 'src/data/villa-diodati/three-days.json'), `${JSON.stringify(threeDays, null, 2)}\n`);
writeFileSync(join(root, 'src/data/villa-diodati/capsule.json'), `${JSON.stringify(capsuleOut, null, 2)}\n`);

const sceneCounts = daysRaw.map((d) => `${d.id}: ${d.scenes.length} scenes`).join(', ');
console.log(`vendor-villa-data: wrote three-days.json (${sceneCounts}; ${threeDays.meta.location}, ${threeDays.meta.dateRange}) and capsule.json (${capsuleOut.personas.length} personas)`);
