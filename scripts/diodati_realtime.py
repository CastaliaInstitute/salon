#!/usr/bin/env python3

"""Focused realtime Matrix agent service for the Villa Diodati salon."""

import json
import os
import pathlib
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
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
MAX_RESPONSE_WORDS = int(os.environ.get("DIODATI_MAX_RESPONSE_WORDS", "70"))
DRAFT_MAX_WORDS = int(os.environ.get("DIODATI_DRAFT_MAX_WORDS", "450"))
FRIDAY_DRAFT_OFFSET_SECONDS = int(
    os.environ.get("DIODATI_FRIDAY_DRAFT_OFFSET_SECONDS", str(4 * 60 * 60))
)
SATURDAY_DRAFT_OFFSET_SECONDS = int(
    os.environ.get("DIODATI_SATURDAY_DRAFT_OFFSET_SECONDS", str(26 * 60 * 60))
)
CRITICISM_OFFSET_SECONDS = int(
    os.environ.get("DIODATI_CRITICISM_OFFSET_SECONDS", str(24 * 60 * 60))
)
SUNDAY_DRAFT_OFFSET_SECONDS = int(
    os.environ.get("DIODATI_SUNDAY_DRAFT_OFFSET_SECONDS", str(48 * 60 * 60))
)
EVENT_WEEKDAY = int(os.environ.get("DIODATI_EVENT_WEEKDAY", "4"))
EVENT_START_HOUR = int(os.environ.get("DIODATI_EVENT_START_HOUR", "18"))
EVENT_START_MINUTE = int(os.environ.get("DIODATI_EVENT_START_MINUTE", "0"))
EVENT_TIMEZONE_NAME = os.environ.get("DIODATI_EVENT_TIMEZONE", "America/Denver")
EVENT_TIMEZONE = ZoneInfo(EVENT_TIMEZONE_NAME)
EVENT_SEASON_START = date.fromisoformat(
    os.environ.get("DIODATI_EVENT_SEASON_START", "2026-09-18")
)
EVENT_SEASON_END = date.fromisoformat(
    os.environ.get("DIODATI_EVENT_SEASON_END", "2026-10-31")
)
if EVENT_SEASON_END < EVENT_SEASON_START:
    raise ValueError("DIODATI_EVENT_SEASON_END must not precede DIODATI_EVENT_SEASON_START")
TEST_OPENING_AT = os.environ.get("DIODATI_TEST_OPENING_AT", "").strip()
TEST_OPENING_TIMESTAMP = None
if TEST_OPENING_AT:
    test_opening = datetime.fromisoformat(TEST_OPENING_AT.replace("Z", "+00:00"))
    if test_opening.tzinfo is None:
        test_opening = test_opening.replace(tzinfo=EVENT_TIMEZONE)
    TEST_OPENING_TIMESTAMP = int(test_opening.timestamp())
REGISTERED_MATRIX_USERS = {
    username.strip()
    for username in os.environ.get("DIODATI_REGISTERED_MATRIX_USERS", "").split(",")
    if username.strip()
}
MEMBER_BRIDGE_USER = os.environ.get(
    "DIODATI_MEMBER_BRIDGE_USER", "@custodian:castalia.institute"
).strip()
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
CRITIQUE_PAIRS = (
    ("a.byron", "a.clairmont"),
    ("a.polidori", "a.byron"),
    ("a.clairmont", "a.maryshelley"),
    ("a.maryshelley", "a.shelley"),
    ("a.shelley", "a.polidori"),
)

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
in any later year. At the scene's beginning no one present has yet conceived or written the works later associated
with this gathering. Manuscripts may develop only through events inside this simulated weekend; their authors still
cannot know later titles, publication, reception, influence, or any continuation not actually written here.

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

DRAFT_ANACHRONISM_PATTERNS = {
    "future manuscript title": r"\b(?:frankenstein|the vampyre)\b",
    "future Mary name": r"\bmary shelley\b",
    "post-1816 manuscript year": r"\b(?:181[7-9]|18[2-9]\d|19\d{2}|20\d{2})\b",
    "Polidori later vampire trajectory": r"\bvamp(?:ire|yre)s?\b",
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


def find_draft_anachronisms(faculty_id, text):
    """Apply the shared boundary plus character-specific manuscript checks."""
    violations = find_anachronisms(text)
    patterns = DRAFT_ANACHRONISM_PATTERNS
    if faculty_id != "a.polidori":
        patterns = {
            name: pattern for name, pattern in patterns.items()
            if name != "Polidori later vampire trajectory"
        }
    for name, pattern in patterns.items():
        if re.search(pattern, text, re.IGNORECASE) and name not in violations:
            violations.append(name)
    return violations


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


def is_registered_event(event):
    sender = event.get("sender", "")
    content = event.get("content", {})
    return sender in REGISTERED_MATRIX_USERS or (
        sender == MEMBER_BRIDGE_USER
        and (
            content.get("org.castalia.member_verified") is True
            or content.get("org.castalia.registration_verified") is True
        )
        and bool(content.get("org.castalia.member_user_id"))
    )


def simulated_time(cycle_id):
    try:
        cycle_started_at = int(cycle_id.rsplit("-", 1)[1])
    except (AttributeError, IndexError, ValueError):
        cycle_started_at = int(time.time())
    elapsed = max(0, time.time() - cycle_started_at)
    # Civil twilight ended at 20:07 UTC at Villa Diodati. Apparent solar
    # time in Geneva was about 25 minutes ahead, so the environment begins
    # at 20:32 Geneva apparent solar time.
    scene_start = datetime(1816, 6, 15, 20, 32, tzinfo=timezone.utc)
    return (scene_start + timedelta(seconds=elapsed)).isoformat().replace("+00:00", "Z")


def scheduled_cycle_start(now=None):
    """Return the active or next opening in the configured season, if any."""
    now = time.time() if now is None else float(now)
    if TEST_OPENING_TIMESTAMP is not None:
        if now < TEST_OPENING_TIMESTAMP + CYCLE_SECONDS:
            return TEST_OPENING_TIMESTAMP
        return None
    opening_date = EVENT_SEASON_START
    while opening_date <= EVENT_SEASON_END:
        if opening_date.weekday() == EVENT_WEEKDAY:
            opening = datetime(
                opening_date.year,
                opening_date.month,
                opening_date.day,
                EVENT_START_HOUR,
                EVENT_START_MINUTE,
                tzinfo=EVENT_TIMEZONE,
            )
            opening_timestamp = int(opening.timestamp())
            if now < opening_timestamp + CYCLE_SECONDS:
                return opening_timestamp
        opening_date += timedelta(days=1)
    return None


def send_message(token, message, cycle_id=None, *, metadata=None, transaction_id=None):
    txn_id = transaction_id or f"diodati-{int(time.time() * 1000)}"
    encoded_room = urllib.parse.quote(ROOM_ID, safe="")
    encoded_transaction = urllib.parse.quote(txn_id, safe="")
    request_json(
        f"{MATRIX_SERVER}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{encoded_transaction}",
        method="PUT",
        headers=matrix_headers(token),
        payload={
            "msgtype": "m.text",
            "body": message,
            **(metadata or {}),
            **({"org.castalia.salon_cycle": cycle_id} if cycle_id else {}),
            **({"org.castalia.simulated_at": simulated_time(cycle_id)} if cycle_id else {}),
            **({"org.castalia.time_basis": "Geneva apparent solar time"} if cycle_id else {}),
        },
    )


def ask_faculty(
    faculty_id,
    visitor_prompt,
    prior_responses,
    *,
    response_style=None,
    max_words=None,
):
    visitor_prompt = redact_future_leaks(visitor_prompt)
    context = "\n\n".join(
        f"{speaker}: {response}" for speaker, response in prior_responses[-3:]
    )
    max_words = MAX_RESPONSE_WORDS if max_words is None else int(max_words)
    response_style = response_style or (
        "Keep this conversational and vivid: one thought in one to three sentences, "
        f"never more than {max_words} words."
    )
    prompt = (
        "You are speaking in the Villa Diodati salon at Lake Geneva during the storm-bound summer of 1816. "
        "Reply in your own historically grounded voice to the established company. Do not welcome or address "
        "an unknown traveller, visitor, guest, or audience. Address a registered guest only when their remark "
        "is explicitly supplied as the initiating remark. "
        f"{response_style}\n\n"
        f"Initiating remark: {visitor_prompt}"
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
                "\n\nYour previous response broke the historical boundary or exceeded the requested length. "
                f"Rewrite it completely in no more than {max_words} words. "
                "Do not mention the correction or any future knowledge."
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
        too_long = len(response.split()) > max_words
        if not violations and not too_long:
            return response
        rejection_reasons = [*violations, *(["overlong response"] if too_long else [])]
        print(
            f"Rejected {faculty_id} draft for: {', '.join(rejection_reasons)}",
            file=sys.stderr,
            flush=True,
        )

    raise RuntimeError(f"response guard failed for {faculty_id}: {', '.join(rejection_reasons)}")


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
        if content.get("org.castalia.diodati_draft"):
            continue
        event_cycle = content.get("org.castalia.salon_cycle")
        if event_cycle and event_cycle != cycle_id:
            continue
        sender = event.get("sender", "")
        localpart = sender.split(":", 1)[0].lstrip("@")
        if localpart not in names and not is_registered_event(event):
            continue
        context.append((names.get(localpart, "A registered guest"), content.get("body", "").strip()))
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

BYRON_FRAGMENT_DIRECTION = (
    "PRIVATE DIRECTION FOR BYRON'S PRESENT MANUSCRIPT: Develop an untitled first-person eastern travel tale. "
    "Its young narrator travels with Augustus Darvell, a slightly older, wealthy, secretive companion whose strength "
    "is failing. Let their unequal intimacy, Darvell's reserve, and the desolate road toward Ephesus gather dread. "
    "As the leaves advance, move toward a Turkish burial ground, sworn secrecy, a seal ring bearing Arabic characters, "
    "and a stork holding a serpent. These are events Byron is inventing now, not retrieved knowledge of a future work. "
    "Keep the manuscript permanently incomplete: never explain Darvell's secret, show what follows the promised errand, "
    "return him from death, or provide narrative resolution. Do not give the tale a title or assign Darvell a named "
    "supernatural species, and never mention later publication, influence, or continuation."
)

CHARACTER_STORY_DIRECTIONS = {
    "a.maryshelley": (
        "MARY'S PRIVATE STORY DIRECTION: Build a distinct tale around a young woman whose intimate knowledge "
        "of a household is treated as imagination until an absence, memory, or visitation proves that the "
        "domestic world has its own moral terrors. Let education, dependence, responsibility, and a woman's "
        "authority shape the dread. Keep the supernatural uncertain and do not invent any future novel."
    ),
    "a.clairmont": (
        "CLAIRE'S PRIVATE STORY DIRECTION: Build a distinct tale around a woman shut out of a pleasure, room, "
        "or confidence who discovers that the excluded can see what the privileged cannot. Give it social heat, "
        "jealousy, music or theatrical illusion, and one startling image at a threshold. Do not make her passive "
        "and do not borrow any later literary work."
    ),
    "a.shelley": (
        "PERCY'S PRIVATE STORY DIRECTION: Build a distinct philosophical tale in which a beautiful natural scene "
        "or mountain passage becomes a crisis of identity, sympathy, and the limits of human perception. Let a "
        "double, echo, dream, or voice trouble the boundary between mind and world without settling the question. "
        "Use the language of natural philosophy, not later science."
    ),
    "a.polidori": (
        "POLIDORI'S PRIVATE STORY DIRECTION: Build a distinct medical-gothic case observed by a physician: an "
        "illness, sleep, wound, or inexplicable recovery creates a conflict between bodily evidence and a patient's "
        "terrifying account. Make professional pride and wounded ambition part of the danger. Do not use a vampire, "
        "a future tale, or retrospective knowledge of this gathering."
    ),
}

DRAFT_STAGES = (
    {
        "id": "friday",
        "revision": 1,
        "offset_seconds": FRIDAY_DRAFT_OFFSET_SECONDS,
        "label": "Friday first leaves",
    },
    {
        "id": "saturday",
        "revision": 2,
        "offset_seconds": SATURDAY_DRAFT_OFFSET_SECONDS,
        "label": "Saturday revision",
    },
    {
        "id": "sunday",
        "revision": 3,
        "offset_seconds": SUNDAY_DRAFT_OFFSET_SECONDS,
        "label": "Sunday revision",
    },
)


def draft_prompt(faculty_id, stage_id, saturday_text=None, criticism_text=None):
    display_name = dict(CAST)[faculty_id]
    character_direction = BYRON_FRAGMENT_DIRECTION if faculty_id == "a.byron" else CHARACTER_STORY_DIRECTIONS[faculty_id]
    if stage_id == "friday":
        return (
            "Byron has issued his challenge. Write the first surviving leaves of your own "
            "supernatural tale now, as a member of this company in June 1816. Create a distinct premise, "
            "scene, and source of dread suited to your character, but leave the manuscript productively "
            "unfinished. Do not imitate, predict, name, or foreshadow any work written after this evening."
            f"\n\n{character_direction}"
        )
    criticism = criticism_text or "No criticism was received; revise in response to the company's pressure."
    return (
        f"Revise and continue the manuscript you wrote in the preceding session. Preserve its premise but sharpen its "
        f"human conflict, supernatural uncertainty, and final image. This is {display_name}'s second draft, "
        "not commentary upon it. Do not mention revision, the challenge, an audience, or any future work.\n\n"
        f"SATURDAY MANUSCRIPT:\n{saturday_text}\n\nSATURDAY CRITICISM:\n{criticism}\n\n{character_direction}"
    )


def generate_character_draft(faculty_id, stage_id, saturday_text=None, criticism_text=None):
    prior = [("Your preceding manuscript", saturday_text)] if saturday_text else []
    if criticism_text:
        prior.append(("Saturday criticism", criticism_text))
    manuscript = ask_faculty(
        faculty_id,
        draft_prompt(faculty_id, stage_id, saturday_text, criticism_text),
        prior,
        response_style=(
            f"Write only the manuscript prose, without a title, preface, explanation, or modern framing. "
            f"Use coherent paragraphs and no more than {DRAFT_MAX_WORDS} words. The piece may be longer "
            "than salon dialogue because it will appear as a separate clickable draft."
        ),
        max_words=DRAFT_MAX_WORDS,
    )
    violations = find_draft_anachronisms(faculty_id, manuscript)
    if violations:
        raise RuntimeError(
            f"manuscript boundary failed for {faculty_id}: {', '.join(violations)}"
        )
    return manuscript


def criticism_prompt(speaker_id, target_id, friday_text):
    speaker_name = dict(CAST)[speaker_id]
    target_name = dict(CAST)[target_id]
    return (
        f"As {speaker_name}, interrupt the Saturday salon with useful criticism of {target_name}'s first "
        "manuscript. Name one vivid strength and one precise pressure point: a motive, human consequence, "
        "or unanswered detail that the writer should confront. Speak directly to the company in no more than "
        "70 words. Do not rewrite the story, address a visitor, mention later works, or use modern framing.\n\n"
        f"{target_name.upper()}'S FRIDAY MANUSCRIPT:\n{friday_text}"
    )


def publish_due_criticisms(bots, cycle, cycle_path, now=None):
    """Publish one useful Saturday criticism for each scheduled story target."""
    if not cycle.get("opening_complete") or not cycle.get("id"):
        return cycle
    now = int(time.time()) if now is None else int(now)
    elapsed = max(0, now - int(cycle["started_at"]))
    if elapsed < CRITICISM_OFFSET_SECONDS:
        return cycle
    draft_texts = cycle.setdefault("draft_texts", {})
    friday_texts = draft_texts.get("friday", {})
    criticisms = cycle.setdefault("criticisms", {})
    published = set(cycle.setdefault("published_criticisms", []))
    for speaker_id, target_id in CRITIQUE_PAIRS:
        criticism_key = target_id
        if criticism_key in published or not friday_texts.get(target_id):
            continue
        try:
            criticism = criticisms.get(criticism_key)
            if not criticism:
                criticism = ask_faculty(
                    speaker_id,
                    criticism_prompt(speaker_id, target_id, friday_texts[target_id]),
                    [(dict(CAST)[target_id], friday_texts[target_id])],
                    response_style="One or two direct, conversational sentences; no more than 70 words.",
                    max_words=70,
                )
                criticisms[criticism_key] = criticism
                save_json(cycle_path, cycle)
            metadata = {
                "org.castalia.diodati_criticism": {
                    "target_faculty_id": target_id,
                    "generated_by": "ask-faculty",
                }
            }
            send_message(
                bots[speaker_id]["access_token"],
                criticism,
                cycle["id"],
                metadata=metadata,
                transaction_id=f"diodati-criticism-{cycle['started_at']}-{target_id}",
            )
            published.add(criticism_key)
            cycle["published_criticisms"] = sorted(published)
            save_json(cycle_path, cycle)
            print(f"Published Saturday criticism for {dict(CAST)[target_id]}", flush=True)
        except Exception as error:
            print(
                f"Criticism for {dict(CAST)[target_id]} failed: {error}",
                file=sys.stderr,
                flush=True,
            )
    return cycle


def publish_due_drafts(bots, cycle, cycle_path, now=None):
    """Generate each due weekend manuscript through ask-faculty and publish it once."""
    if not cycle.get("opening_complete") or not cycle.get("id"):
        return cycle
    now = int(time.time()) if now is None else int(now)
    elapsed = max(0, now - int(cycle["started_at"]))
    published = set(cycle.setdefault("published_drafts", []))
    draft_texts = cycle.setdefault("draft_texts", {})

    stage_ids = {candidate["id"] for candidate in DRAFT_STAGES}
    for stage in DRAFT_STAGES:
        if elapsed < stage["offset_seconds"]:
            continue
        stage_texts = draft_texts.setdefault(stage["id"], {})
        for faculty_id, display_name in CAST:
            draft_key = f"{stage['id']}:{faculty_id}"
            if draft_key in published:
                continue
            previous_stage = {"saturday": "friday", "sunday": "saturday"}.get(stage["id"])
            prior_text = draft_texts.get(previous_stage, {}).get(faculty_id) if previous_stage else None
            if previous_stage in stage_ids and not prior_text:
                continue
            try:
                manuscript = stage_texts.get(faculty_id)
                if not manuscript:
                    draft_kwargs = {"saturday_text": prior_text}
                    if stage["id"] == "sunday" and cycle.get("criticisms", {}).get(faculty_id):
                        draft_kwargs["criticism_text"] = cycle["criticisms"][faculty_id]
                    manuscript = generate_character_draft(
                        faculty_id,
                        stage["id"],
                        **draft_kwargs,
                    )
                    # Persist before sending. A crash can then retry the exact
                    # manuscript with the same Matrix transaction id rather
                    # than generating divergent text.
                    stage_texts[faculty_id] = manuscript
                    save_json(cycle_path, cycle)
                metadata = {
                    "org.castalia.diodati_draft": {
                        "stage": stage["id"],
                        "revision": stage["revision"],
                        "label": stage["label"],
                        "title": f"{display_name}'s {stage['label'].lower()}",
                        "faculty_id": faculty_id,
                        "generated_by": "ask-faculty",
                    }
                }
                send_message(
                    bots[faculty_id]["access_token"],
                    manuscript,
                    cycle["id"],
                    metadata=metadata,
                    transaction_id=(
                        f"diodati-draft-{cycle['started_at']}-{stage['id']}-{faculty_id}"
                    ),
                )
                published.add(draft_key)
                cycle["published_drafts"] = sorted(published)
                save_json(cycle_path, cycle)
                print(f"Published {stage['label']} for {display_name}", flush=True)
            except Exception as error:
                print(
                    f"{display_name} {stage['label']} failed: {error}",
                    file=sys.stderr,
                    flush=True,
                )
    return cycle


def run_autonomous_turn(bots, cycle):
    turn_index = int(cycle.get("turn_index", 0))
    faculty_id, display_name = CAST[turn_index % len(CAST)]
    elapsed = max(0, time.time() - float(cycle["started_at"]))
    day = min(3, int(elapsed // (24 * 60 * 60)) + 1)
    cue = AUTONOMOUS_CUES[turn_index % len(AUTONOMOUS_CUES)]
    context = recent_salon_context(bots["a.byron"]["access_token"], cycle["id"])
    prompt = (
        f"This is day {day} of the company's three-day storm-bound gathering. {cue} "
        "Speak only to the established company. Never welcome, acknowledge, or address a traveller, visitor, "
        "guest, or audience. You may address a registered guest only when the most recent context line is "
        "explicitly labelled 'A registered guest'."
    )
    response = ask_faculty(
        faculty_id,
        prompt,
        context,
        response_style=(
            f"Continue the live exchange in one to three sentences and no more than {MAX_RESPONSE_WORDS} words. "
            "Respond to the most recent thought, make one distinct contribution, and end with tension, "
            "invitation, or a question rather than a speech."
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

    if cycle:
        started_at = int(cycle.get("started_at", 0))
        if now < started_at:
            return cycle
        if now - started_at < CYCLE_SECONDS:
            if not cycle.get("opening_complete"):
                run_opening(bots, cycle["id"])
                cycle["opening_complete"] = True
                cycle["next_turn_at"] = int(time.time()) + TURN_INTERVAL_SECONDS
                save_json(cycle_path, cycle)
                print(f"Opened scheduled Diodati cycle {cycle['id']}", flush=True)
            return cycle

    started_at = scheduled_cycle_start(now)
    if started_at is None:
        cycle = {
            "id": None,
            "started_at": 0,
            "turn_index": 0,
            "next_turn_at": 0,
            "opening_complete": False,
            "season_complete": True,
        }
        save_json(cycle_path, cycle)
        return cycle
    cycle = {
        "id": f"diodati-{started_at}",
        "started_at": started_at,
        "turn_index": 0,
        "next_turn_at": started_at + TURN_INTERVAL_SECONDS,
        "opening_complete": False,
    }
    save_json(cycle_path, cycle)
    if now >= started_at:
        run_opening(bots, cycle["id"])
        cycle["opening_complete"] = True
        cycle["next_turn_at"] = int(time.time()) + TURN_INTERVAL_SECONDS
        save_json(cycle_path, cycle)
        print(f"Opened scheduled Diodati cycle {cycle['id']}", flush=True)
    else:
        opening = datetime.fromtimestamp(started_at, timezone.utc).astimezone(EVENT_TIMEZONE)
        print(f"Diodati waits for {opening.isoformat()}", flush=True)
    return cycle


def sync(bots):
    observer = bots["a.byron"]
    observer_token = observer["access_token"]
    bot_usernames = {bot["username"] for bot in bots.values()}
    token_path = STATE_DIR / "sync-token"
    cycle_filename = (
        f"test-opening-{TEST_OPENING_TIMESTAMP}.json"
        if TEST_OPENING_TIMESTAMP is not None
        else "september-preview-october-members-v1.json"
    )
    cycle_path = STATE_DIR / cycle_filename
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
        publish_due_criticisms(bots, cycle, cycle_path)
        publish_due_drafts(bots, cycle, cycle_path)
        if cycle.get("opening_complete") and int(time.time()) >= int(cycle.get("next_turn_at", 0)):
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
            if not is_registered_event(event):
                print(
                    f"Ignored unregistered Diodati sender {event.get('sender', '<unknown>')}",
                    flush=True,
                )
                continue
            if not cycle.get("opening_complete"):
                print("Held registered Diodati remark until the next scheduled opening", flush=True)
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
