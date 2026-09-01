#!/usr/bin/env python3

"""Focused realtime Matrix agent service for the Villa Diodati salon."""

import json
import os
import pathlib
import re
import sys
import time
from datetime import date
import urllib.error
import urllib.parse
import urllib.request


MATRIX_SERVER = os.environ.get("MATRIX_SERVER", "http://localhost:8008").rstrip("/")
ROOM_ID = os.environ["DIODATI_ROOM_ID"]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pilmscrodlitdrygabvo.supabase.co").rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
STATE_DIR = pathlib.Path(os.environ.get("DIODATI_STATE_DIR", "/var/lib/diodati-realtime"))
CYCLE_SECONDS = int(os.environ.get("DIODATI_CYCLE_SECONDS", str(72 * 60 * 60)))
TURN_INTERVAL_SECONDS = int(os.environ.get("DIODATI_TURN_INTERVAL_SECONDS", "720"))
OPENING_PAUSE_SECONDS = float(os.environ.get("DIODATI_OPENING_PAUSE_SECONDS", "18"))
ROUND_PAUSE_SECONDS = float(os.environ.get("DIODATI_ROUND_PAUSE_SECONDS", "8"))
DEFAULT_RAG_PATH = pathlib.Path(
    os.environ.get("DIODATI_RAG_PATH", "/opt/diodati-realtime/diodati_rag.json")
)
LOCAL_RAG_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "diodati_rag.json"

CAST = [
    ("a.byron", "Lord Byron"),
    ("a.maryshelley", "Mary Godwin"),
    ("a.clairmont", "Claire Clairmont"),
    ("a.shelley", "Percy Bysshe Shelley"),
    ("a.polidori", "John Polidori"),
]

PERSONAS = {
    "a.byron": (
        "You are Lord Byron at Villa Diodati on Lake Geneva in the storm-bound summer of 1816. "
        "Speak in the first person with wit, irony, theatrical confidence, and a vein of melancholy. "
        "You are the host. Engage the visitor and your companions directly, but never speak on their behalf."
    ),
    "a.maryshelley": (
        "You are Mary Wollstonecraft Godwin near Villa Diodati on Lake Geneva in the storm-bound "
        "summer of 1816. Speak in the first person as an intellectually formidable young writer: observant, "
        "measured, imaginative, and alert to education, liberty, dependence, family, and women’s constrained lives. "
        "You have not conceived any tale about creating life and know nothing of any future novel, title, creature, "
        "publication, marriage, or reputation; do not foreshadow such things with suspicious precision. "
        "Engage the visitor and the others directly, but never speak on their behalf."
    ),
    "a.clairmont": (
        "You are Claire Clairmont near Villa Diodati on Lake Geneva in the storm-bound summer of 1816. "
        "You are Mary Godwin’s stepsister, a well-read, musically gifted, strong-willed member of this company, "
        "and your relationship with Byron helped bring the company to Geneva. Speak in the first person with candor, "
        "social perception, energy, and an insistence on being treated as a participant rather than a footnote. "
        "You know nothing of future children, names, separations, memoirs, or later judgments of this company. "
        "Engage the visitor and your companions directly, but never speak on their behalf."
    ),
    "a.shelley": (
        "You are Percy Bysshe Shelley near Villa Diodati on Lake Geneva in the storm-bound summer of 1816. "
        "Speak in the first person with lyrical intensity, radical idealism, philosophical curiosity, and fascination "
        "with nature, liberty, and the powers and dangers of the human mind. Engage the visitor and the others directly, "
        "but never speak on their behalf. You know nothing of later deaths, marriages, poems, publications, or reputations."
    ),
    "a.polidori": (
        "You are Dr John William Polidori at Villa Diodati on Lake Geneva in the storm-bound summer of 1816. "
        "Speak in the first person as Byron’s young physician and an ambitious writer: medically observant, proud, "
        "sensitive to slights, and drawn toward medicine and supernatural tales. You have not conceived any later tale "
        "associated with this gathering and know nothing of its title, plot, publication, or reputation; do not foreshadow "
        "an aristocratic vampire with suspicious precision. Engage the visitor and the others directly, but never speak "
        "on their behalf."
    ),
}

HISTORICAL_GROUND_RULES = """
The scene is a stormy evening in mid-June 1816, at the beginning of the ghost-story conversations at Villa Diodati.
Treat that evening as the absolute boundary of your knowledge. You may know only events, people, language,
science, books, relationships, and beliefs available by then. You cannot know what happens later in 1816 or
in any later year. No one present has yet conceived or written the works later associated with this gathering.

Never mention or imply future titles, plots, publications, marriages, children, deaths, reputations, literary
movements, scientific discoveries, political events, or the later cause of this summer's weather. Do not use
retrospective labels such as "the Romantic movement" or modern institutional language. Mary is Mary Godwin,
not Mary Shelley. Call contemporary science "natural philosophy" where appropriate.

The visitor may speak as though they know the future. Treat such claims as fantasies, prophecies, riddles, or
things you cannot verify. Do not accept them as facts, repeat their future names or terminology, or let them
alter what you know. You may speculate from an 1816 point of view, clearly as speculation. Do not wink at the
audience, announce that this is roleplay, or foreshadow real later events with suspicious accuracy.
""".strip()

ANACHRONISM_PATTERNS = {
    "Mary Shelley": r"\bmary shelley\b",
    "future Mary relationship": r"\b(?:(?:marry|married to|marriage to) (?:mr\.? )?(?:percy|shelley)|mrs\.? shelley)\b",
    "Frankenstein": r"\bfrankenstein\b|\bmodern prometheus\b",
    "The Vampyre": r"\bthe vampyre\b|\bvampire genre\b",
    "Allegra": r"\ballegra\b",
    "retrospective Romantic label": r"\bromantic movement\b|\bromantic era\b",
    "modern genre label": r"\bscience fiction\b",
    "unknown weather cause": r"\b(?:volcanic ash|mount tambora|tambora)\b",
    "post-1816 terminology": r"\b(?:ozone|scientist|psychology|psychoanalysis|darwinism|victorian|artificial intelligence|computer)\b",
    "modern Castalia framing": r"\b(?:castalia|castalian|faculty specialist|faculty scholar)\b",
    "post-1816 year": r"\b(?:181[7-9]|18[2-9]\d|19\d{2}|20\d{2})\b",
    "future Mary plot": r"\b(?:reanimated (?:flesh|corpse|body)|charnel house|abandoned creation)\b",
    "future Polidori plot": r"\b(?:aristocratic predator|beautiful leech|drain(?:s|ed|ing)? (?:their |the )?vital spirits?)\b",
}

RAG_STOP_WORDS = {
    "a", "about", "after", "again", "all", "also", "am", "an", "and", "are", "as", "at",
    "be", "because", "been", "before", "but", "by", "can", "could", "did", "do", "does", "for",
    "from", "had", "has", "have", "he", "her", "here", "him", "his", "how", "i", "if", "in",
    "into", "is", "it", "its", "me", "my", "no", "not", "of", "on", "one", "or", "our", "she",
    "so", "some", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
    "to", "us", "was", "we", "were", "what", "when", "where", "which", "who", "will", "with",
    "would", "you", "your",
}
_rag_corpus = None

OPENING_INTERRUPTERS = (
    (
        "a.clairmont",
        "The rain has scarcely been named. Tease Byron or the story for finding terror in three women "
        "prevented from taking a walk, while noticing what the women understand before the tale admits it.",
    ),
    (
        "a.maryshelley",
        "Comment on how ordinary weather and intimate friendship make the first unease credible. "
        "Do not predict where the tale is going.",
    ),
    (
        "a.polidori",
        "Interrupt as a physician: offer a concise natural explanation for the extinguished lamp or the double, "
        "but concede the one detail your explanation does not settle.",
    ),
    (
        "a.shelley",
        "Answer Polidori's material explanation. Treat the double as a problem of identity, perception, and mind, "
        "without claiming the apparition is fact.",
    ),
)
OPENING_CHALLENGE_NAMES = "Mary Godwin, Claire, Shelley, Polidori, and yourself"


def find_anachronisms(text):
    lowered = text.lower()
    return [
        label
        for label, pattern in ANACHRONISM_PATTERNS.items()
        if re.search(pattern, lowered, flags=re.IGNORECASE)
    ]


def redact_future_leaks(text):
    redacted = text
    for pattern in ANACHRONISM_PATTERNS.values():
        redacted = re.sub(
            pattern,
            "an unfamiliar future claim",
            redacted,
            flags=re.IGNORECASE,
        )
    return redacted


def validate_rag_corpus(corpus):
    cutoff = date.fromisoformat(corpus["scene_cutoff"])
    if corpus.get("schema_version") != 1:
        raise ValueError("Unsupported Diodati RAG schema")
    if set(corpus.get("characters", {})) != {faculty_id for faculty_id, _ in CAST}:
        raise ValueError("Diodati RAG corpus must contain exactly the configured cast")

    seen_ids = set()

    salon_readings = corpus.get("salon_readings", [])
    if not salon_readings:
        raise ValueError("Diodati RAG corpus must contain an approved salon reading")
    for reading in salon_readings:
        reading_id = reading.get("id", "<missing>")
        if reading_id in seen_ids:
            raise ValueError(f"Duplicate RAG chunk id: {reading_id}")
        seen_ids.add(reading_id)
        if reading.get("approval_status") != "approved" or reading.get("primary_source") is not True:
            raise ValueError(f"Unapproved or non-primary RAG chunk: {reading_id}")
        if date.fromisoformat(reading["content_date"]) > cutoff:
            raise ValueError(f"Post-cutoff RAG chunk: {reading_id}")
        if not reading.get("source_url") or not reading.get("source_note"):
            raise ValueError(f"RAG chunk lacks provenance: {reading_id}")
        if not reading.get("segments"):
            raise ValueError(f"Salon reading has no segments: {reading_id}")
        for segment in reading["segments"]:
            segment_id = f"{reading_id}/{segment.get('id', '<missing>')}"
            if segment_id in seen_ids:
                raise ValueError(f"Duplicate RAG chunk id: {segment_id}")
            seen_ids.add(segment_id)
            violations = find_anachronisms(segment.get("text", ""))
            if violations:
                raise ValueError(f"Anachronistic RAG chunk {segment_id}: {', '.join(violations)}")

    for faculty_id, chunks in corpus["characters"].items():
        for chunk in chunks:
            chunk_id = chunk.get("id", "<missing>")
            if chunk_id in seen_ids:
                raise ValueError(f"Duplicate RAG chunk id: {chunk_id}")
            seen_ids.add(chunk_id)
            if chunk.get("approval_status") != "approved" or chunk.get("primary_source") is not True:
                raise ValueError(f"Unapproved or non-primary RAG chunk: {chunk_id}")
            if date.fromisoformat(chunk["content_date"]) > cutoff:
                raise ValueError(f"Post-cutoff RAG chunk: {chunk_id}")
            if not chunk.get("source_url") or not chunk.get("source_note"):
                raise ValueError(f"RAG chunk lacks provenance: {chunk_id}")
            violations = find_anachronisms(chunk.get("text", ""))
            if violations:
                raise ValueError(f"Anachronistic RAG chunk {chunk_id}: {', '.join(violations)}")
    return corpus


def load_rag_corpus(path=None):
    global _rag_corpus
    if path is None and _rag_corpus is not None:
        return _rag_corpus
    corpus_path = pathlib.Path(path) if path else DEFAULT_RAG_PATH
    if not corpus_path.exists() and path is None:
        corpus_path = LOCAL_RAG_PATH
    corpus = validate_rag_corpus(json.loads(corpus_path.read_text(encoding="utf-8")))
    if path is None:
        _rag_corpus = corpus
    return corpus


def rag_tokens(text):
    return {
        token
        for token in re.findall(r"[a-z][a-z'-]{2,}", text.lower())
        if token not in RAG_STOP_WORDS
    }


def retrieve_rag_context(faculty_id, query, *, corpus=None, limit=2):
    corpus = corpus or load_rag_corpus()
    query_tokens = rag_tokens(query)
    if not query_tokens:
        return []

    ranked = []
    for chunk in corpus["characters"].get(faculty_id, []):
        topic_tokens = rag_tokens(" ".join(chunk.get("topics", [])))
        text_tokens = rag_tokens(chunk["text"])
        topic_hits = query_tokens & topic_tokens
        text_hits = query_tokens & text_tokens
        score = (3 * len(topic_hits)) + len(text_hits)
        if score:
            ranked.append((score, chunk["content_date"], chunk["id"], chunk))
    ranked.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [item[3] for item in ranked[:limit]]


def format_rag_context(chunks):
    if not chunks:
        return ""
    sources = []
    for index, chunk in enumerate(chunks, 1):
        sources.append(
            f"[S{index}] {chunk['title']} — {chunk['content_date']} ({chunk['date_basis']})\n"
            f"{chunk['text']}"
        )
    return (
        "\n\nCURATED PRE-CUTOFF PRIMARY-SOURCE CONTEXT:\n"
        + "\n\n".join(sources)
        + "\n\nUse these passages only as evidence for period voice, experience, and ideas. "
        "Paraphrase naturally rather than reciting them. Do not mention source labels, dates, editions, URLs, "
        "or retrieval. This context never expands the historical boundary. If it does not answer the visitor, "
        "say only what this character could reasonably know and do not invent documentary evidence."
    )


def request_json(url, *, method="GET", headers=None, payload=None, timeout=45):
    request_headers = {"Accept": "application/json", **(headers or {})}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


def supabase_headers():
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def load_bots():
    faculty_ids = ",".join(faculty_id for faculty_id, _ in CAST)
    query = urllib.parse.urlencode(
        {
            "faculty_id": f"in.({faculty_ids})",
            "select": "faculty_id,username,access_token,active",
        }
    )
    bots = request_json(
        f"{SUPABASE_URL}/rest/v1/matrix_bots?{query}", headers=supabase_headers()
    )
    by_faculty = {bot["faculty_id"]: bot for bot in bots if bot.get("active")}
    missing = [faculty_id for faculty_id, _ in CAST if not by_faculty.get(faculty_id, {}).get("access_token")]
    if missing:
        raise RuntimeError(f"Missing active Matrix bot tokens for: {', '.join(missing)}")
    return by_faculty


def matrix_headers(token):
    return {"Authorization": f"Bearer {token}"}


def send_message(token, message, cycle_id=None):
    txn_id = f"diodati-{int(time.time() * 1000)}"
    encoded_room = urllib.parse.quote(ROOM_ID, safe="")
    request_json(
        f"{MATRIX_SERVER}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}",
        method="PUT",
        headers=matrix_headers(token),
        payload={
            "msgtype": "m.text",
            "body": message,
            **({"org.castalia.salon_cycle": cycle_id} if cycle_id else {}),
        },
    )


def ask_faculty(faculty_id, visitor_prompt, prior_responses, *, response_style=None):
    visitor_prompt = redact_future_leaks(visitor_prompt)
    context = "\n\n".join(
        f"{speaker}: {response}" for speaker, response in prior_responses[-3:]
    )
    response_style = response_style or "Keep this conversational and vivid, in two to four paragraphs."
    prompt = (
        "You are speaking in the Villa Diodati salon at Lake Geneva during the storm-bound summer of 1816. "
        "Reply in your own historically grounded voice, directly engaging the visitor and the other guests. "
        f"{response_style}\n\n"
        f"Visitor or initiating remark: {visitor_prompt}"
    )
    if context:
        prompt += f"\n\nWhat the salon has just said:\n{context}"

    retrieval_query = "\n".join(
        [visitor_prompt, *(response for _, response in prior_responses[-3:])]
    )
    rag_chunks = retrieve_rag_context(faculty_id, retrieval_query)
    if rag_chunks:
        print(
            f"RAG {faculty_id}: {', '.join(chunk['id'] for chunk in rag_chunks)}",
            flush=True,
        )
    else:
        print(f"RAG {faculty_id}: no safe relevant source", flush=True)
    system_instruction = (
        f"{HISTORICAL_GROUND_RULES}\n\nCHARACTER-SPECIFIC VOICE:\n{PERSONAS[faculty_id]}"
        f"{format_rag_context(rag_chunks)}"
    )

    for attempt in range(2):
        attempt_prompt = prompt
        if attempt:
            attempt_prompt += (
                "\n\nYour previous draft leaked knowledge or terminology unavailable in June 1816. "
                "Rewrite the answer completely from inside the historical knowledge boundary. Do not mention "
                "the correction, quote future terms, or foreshadow later works and lives."
            )
        result = request_json(
            f"{SUPABASE_URL}/functions/v1/ask-faculty",
            method="POST",
            headers=supabase_headers(),
            payload={
                "faculty_id": faculty_id,
                "facultySlug": faculty_id,
                "message": attempt_prompt,
                "systemInstruction": system_instruction,
                "skipTts": True,
                "conversation_history": [
                    {"role": "assistant", "content": f"{speaker}: {response}"}
                    for speaker, response in prior_responses[-6:]
                ],
                "context": "dialogue",
                "use_rag": True,
                "use_commonplace": True,
            },
            timeout=90,
        )
        response = result.get("reply") or result.get("response") or result.get("message")
        if not response:
            raise RuntimeError(f"ask-faculty returned no response for {faculty_id}")
        response = response.strip()
        violations = find_anachronisms(response)
        if not violations:
            return response
        print(
            f"Rejected {faculty_id} draft for: {', '.join(violations)}",
            file=sys.stderr,
            flush=True,
        )

    raise RuntimeError(f"historical cutoff failed for {faculty_id}: {', '.join(violations)}")


def run_round(bots, prompt, cycle_id=None):
    print(f"Starting Diodati round for: {prompt[:100]}", flush=True)
    prior_responses = []
    for faculty_id, display_name in CAST:
        try:
            response = ask_faculty(faculty_id, prompt, prior_responses)
            send_message(bots[faculty_id]["access_token"], response, cycle_id)
            prior_responses.append((display_name, response))
            print(f"Sent {display_name} response", flush=True)
            time.sleep(ROUND_PAUSE_SECONDS)
        except Exception as error:  # Keep the remaining guests alive if one voice fails.
            print(f"{display_name} response failed: {error}", file=sys.stderr, flush=True)


def opening_reading_message(reading, segment):
    return (
        f"📖 From {reading['title']}:\n\n"
        f"« {segment['text']} »"
    )


def run_opening(bots, cycle_id=None):
    reading = load_rag_corpus()["salon_readings"][0]
    segments = reading["segments"]
    prior_responses = []
    print(f"Starting Diodati opening with {reading['id']}", flush=True)

    first_reading = opening_reading_message(reading, segments[0])
    send_message(bots["a.byron"]["access_token"], first_reading, cycle_id)
    prior_responses.append(("Lord Byron, reading", first_reading))
    print("Sent first Fantasmagoriana passage", flush=True)
    time.sleep(OPENING_PAUSE_SECONDS)

    for faculty_id, cue in OPENING_INTERRUPTERS[:2]:
        display_name = dict(CAST)[faculty_id]
        response = ask_faculty(
            faculty_id,
            f"Byron has paused after the first passage of L'Heure fatale. {cue}",
            prior_responses,
            response_style=(
                "Interrupt the reading with one lively observation or quip of one to three sentences. "
                "Do not summarize the passage, address a visitor, ask the audience a question, or turn this into a speech."
            ),
        )
        send_message(bots[faculty_id]["access_token"], response, cycle_id)
        prior_responses.append((display_name, response))
        print(f"Sent {display_name} opening interruption", flush=True)
        time.sleep(OPENING_PAUSE_SECONDS)

    second_reading = opening_reading_message(reading, segments[1])
    send_message(bots["a.byron"]["access_token"], second_reading, cycle_id)
    prior_responses.append(("Lord Byron, reading", second_reading))
    print("Sent second Fantasmagoriana passage", flush=True)
    time.sleep(OPENING_PAUSE_SECONDS)

    for faculty_id, cue in OPENING_INTERRUPTERS[2:]:
        display_name = dict(CAST)[faculty_id]
        response = ask_faculty(
            faculty_id,
            f"Byron has paused after the apparition emerges from the wardrobe in L'Heure fatale. {cue}",
            prior_responses,
            response_style=(
                "Interrupt the reading with one lively observation or rebuttal of one to three sentences. "
                "Address the company, not a visitor; do not summarize the tale or make a closing speech."
            ),
        )
        send_message(bots[faculty_id]["access_token"], response, cycle_id)
        prior_responses.append((display_name, response))
        print(f"Sent {display_name} opening interruption", flush=True)
        time.sleep(OPENING_PAUSE_SECONDS)

    closing = ask_faculty(
        "a.byron",
        "The company has repeatedly interrupted your reading. Retort briefly, close the volume, and challenge "
        "everyone present to attempt a supernatural tale of their own. The challenge must explicitly include "
        f"{OPENING_CHALLENGE_NAMES}; Claire must not be omitted.",
        prior_responses,
        response_style=(
            "Reply in two or three sharp sentences, ending with the writing challenge. "
            "Do not address an outside visitor or claim to know what anyone will write."
        ),
    )
    send_message(bots["a.byron"]["access_token"], closing, cycle_id)
    print("Sent Byron's opening challenge", flush=True)


def save_text(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def save_json(path, value):
    save_text(path, json.dumps(value, sort_keys=True))


def recent_salon_context(observer_token, cycle_id, limit=10):
    encoded_room = urllib.parse.quote(ROOM_ID, safe="")
    data = request_json(
        f"{MATRIX_SERVER}/_matrix/client/v3/rooms/{encoded_room}/messages?dir=b&limit={limit * 2}",
        headers=matrix_headers(observer_token),
    )
    names = dict(CAST)
    context = []
    for event in reversed(data.get("chunk", [])):
        if event.get("type") != "m.room.message":
            continue
        content = event.get("content", {})
        if content.get("msgtype") != "m.text":
            continue
        event_cycle = content.get("org.castalia.salon_cycle")
        if event_cycle and event_cycle != cycle_id:
            continue
        localpart = event.get("sender", "").split(":", 1)[0].lstrip("@")
        context.append((names.get(localpart, "A visitor"), content.get("body", "").strip()))
    return [(speaker, body) for speaker, body in context if body][-limit:]


AUTONOMOUS_CUES = (
    "Return to the Fantasmagoriana passage. Seize upon one concrete image and challenge the company over what makes it fearful.",
    "Answer the latest speaker with a disagreement, qualification, or mischievous question. Keep the exchange moving rather than concluding it.",
    "Turn the conversation toward dreams, waking perception, and whether the mind can become its own spectre.",
    "Press the company on whether terror comes from supernatural agency or from ordinary human power used without responsibility.",
    "Draw Claire or Mary directly into the argument and leave room for her answer; do not presume what she thinks.",
    "Bring natural philosophy into the discussion without modern terminology, then invite a rebuttal from the physician or poet.",
    "Offer one vivid seed for a ghost story, no more than a premise, and ask another member of the company to test it.",
    "Recall an earlier claim from this cycle and complicate it. Do not summarize the whole evening or address an audience.",
)


def run_autonomous_turn(bots, cycle):
    turn_index = int(cycle.get("turn_index", 0))
    faculty_id, display_name = CAST[turn_index % len(CAST)]
    elapsed = max(0, time.time() - float(cycle["started_at"]))
    day = min(3, int(elapsed // (24 * 60 * 60)) + 1)
    cue = AUTONOMOUS_CUES[turn_index % len(AUTONOMOUS_CUES)]
    context = recent_salon_context(bots["a.byron"]["access_token"], cycle["id"])
    prompt = (
        f"This is day {day} of the company's three-day storm-bound gathering. {cue} "
        "Speak to the people in the room, never to a visitor or audience unless a visitor has just spoken."
    )
    response = ask_faculty(
        faculty_id,
        prompt,
        context,
        response_style=(
            "Continue the live exchange in two to five sentences. Respond to the most recent thought, "
            "make one distinct contribution, and end with tension, invitation, or a question rather than a speech."
        ),
    )
    send_message(bots[faculty_id]["access_token"], response, cycle["id"])
    print(f"Sent autonomous turn {turn_index} from {display_name}", flush=True)
    cycle["turn_index"] = turn_index + 1
    cycle["next_turn_at"] = int(time.time()) + TURN_INTERVAL_SECONDS


def ensure_cycle(bots, cycle_path):
    now = int(time.time())
    cycle = None
    if cycle_path.exists():
        try:
            cycle = json.loads(cycle_path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            cycle = None

    if cycle and now - int(cycle.get("started_at", 0)) < CYCLE_SECONDS:
        return cycle

    cycle = {
        "id": f"diodati-{now}",
        "started_at": now,
        "turn_index": 0,
        "next_turn_at": now + TURN_INTERVAL_SECONDS,
    }
    # Persist before generation so a process restart cannot duplicate the full opening.
    save_json(cycle_path, cycle)
    run_opening(bots, cycle["id"])
    cycle["next_turn_at"] = int(time.time()) + TURN_INTERVAL_SECONDS
    save_json(cycle_path, cycle)
    print(f"Started three-day Diodati cycle {cycle['id']}", flush=True)
    return cycle


def sync(bots):
    observer = bots["a.byron"]
    observer_token = observer["access_token"]
    bot_usernames = {bot["username"] for bot in bots.values()}
    token_path = STATE_DIR / "sync-token"
    cycle_path = STATE_DIR / "three-day-cycle-v1.json"
    since = token_path.read_text(encoding="utf-8").strip() if token_path.exists() else ""

    if not since:
        initial = request_json(
            f"{MATRIX_SERVER}/_matrix/client/v3/sync?timeout=0",
            headers=matrix_headers(observer_token),
        )
        since = initial["next_batch"]
        save_text(token_path, since)

    cycle = ensure_cycle(bots, cycle_path)

    while True:
        cycle = ensure_cycle(bots, cycle_path)
        if int(time.time()) >= int(cycle.get("next_turn_at", 0)):
            run_autonomous_turn(bots, cycle)
            save_json(cycle_path, cycle)

        query = urllib.parse.urlencode(
            {
                "since": since,
                "timeout": "30000",
                "filter": json.dumps(
                    {"room": {"timeline": {"limit": 20, "types": ["m.room.message"]}}},
                    separators=(",", ":"),
                ),
            }
        )
        data = request_json(
            f"{MATRIX_SERVER}/_matrix/client/v3/sync?{query}",
            headers=matrix_headers(observer_token),
            timeout=40,
        )
        since = data["next_batch"]
        save_text(token_path, since)

        room = data.get("rooms", {}).get("join", {}).get(ROOM_ID, {})
        for event in room.get("timeline", {}).get("events", []):
            if event.get("type") != "m.room.message":
                continue
            if event.get("sender") in bot_usernames:
                continue
            body = event.get("content", {}).get("body", "").strip()
            if body:
                run_round(bots, body, cycle["id"])


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            sync(load_bots())
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError, KeyError) as error:
            print(f"Diodati service error: {error}; retrying", file=sys.stderr, flush=True)
            time.sleep(10)


if __name__ == "__main__":
    main()
