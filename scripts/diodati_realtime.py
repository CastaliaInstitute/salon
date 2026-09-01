#!/usr/bin/env python3

"""Focused realtime Matrix agent service for the Villa Diodati salon."""

import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


MATRIX_SERVER = os.environ.get("MATRIX_SERVER", "http://localhost:8008").rstrip("/")
ROOM_ID = os.environ["DIODATI_ROOM_ID"]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pilmscrodlitdrygabvo.supabase.co").rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
STATE_DIR = pathlib.Path(os.environ.get("DIODATI_STATE_DIR", "/var/lib/diodati-realtime"))

CAST = [
    ("a.byron", "Lord Byron"),
    ("a.shelley", "Mary Shelley"),
    ("a.shelley1", "Percy Bysshe Shelley"),
    ("a.polidori", "John Polidori"),
]


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


def send_message(token, message):
    txn_id = f"diodati-{int(time.time() * 1000)}"
    encoded_room = urllib.parse.quote(ROOM_ID, safe="")
    request_json(
        f"{MATRIX_SERVER}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}",
        method="PUT",
        headers=matrix_headers(token),
        payload={"msgtype": "m.text", "body": message},
    )


def ask_faculty(faculty_id, visitor_prompt, prior_responses):
    context = "\n\n".join(
        f"{speaker}: {response}" for speaker, response in prior_responses[-3:]
    )
    prompt = (
        "You are speaking in the Villa Diodati salon at Lake Geneva during the storm-bound summer of 1816. "
        "Reply in your own historically grounded voice, directly engaging the visitor and the other guests. "
        "Keep this conversational and vivid, in two to four paragraphs.\n\n"
        f"Visitor or initiating remark: {visitor_prompt}"
    )
    if context:
        prompt += f"\n\nWhat the salon has just said:\n{context}"

    result = request_json(
        f"{SUPABASE_URL}/functions/v1/ask-faculty",
        method="POST",
        headers=supabase_headers(),
        payload={
            "faculty_id": faculty_id,
            "message": prompt,
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
    return response.strip()


def run_round(bots, prompt):
    print(f"Starting Diodati round for: {prompt[:100]}", flush=True)
    prior_responses = []
    for faculty_id, display_name in CAST:
        try:
            response = ask_faculty(faculty_id, prompt, prior_responses)
            send_message(bots[faculty_id]["access_token"], response)
            prior_responses.append((display_name, response))
            print(f"Sent {display_name} response", flush=True)
            time.sleep(1.25)
        except Exception as error:  # Keep the remaining guests alive if one voice fails.
            print(f"{display_name} response failed: {error}", file=sys.stderr, flush=True)


def save_text(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def sync(bots):
    observer = bots["a.byron"]
    observer_token = observer["access_token"]
    bot_usernames = {bot["username"] for bot in bots.values()}
    token_path = STATE_DIR / "sync-token"
    seed_path = STATE_DIR / "seeded"
    since = token_path.read_text(encoding="utf-8").strip() if token_path.exists() else ""

    if not since:
        initial = request_json(
            f"{MATRIX_SERVER}/_matrix/client/v3/sync?timeout=0",
            headers=matrix_headers(observer_token),
        )
        since = initial["next_batch"]
        save_text(token_path, since)

    if not seed_path.exists():
        run_round(
            bots,
            "The thunder has trapped us indoors. What kind of ghost story could reveal the deepest danger in modern creation?",
        )
        save_text(seed_path, str(int(time.time())))

    while True:
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
                run_round(bots, body)


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
