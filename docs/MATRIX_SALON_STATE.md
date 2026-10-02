# Villa Diodati Matrix room state

The Three.js room consumes one Matrix state event:

```text
org.castalia.salon.room
```

Its payload must identify the shared contract:

```json
{
  "map": "villa-diodati-salon-v1",
  "coordinate_system": "villa-diodati-isometric-v1"
}
```

The canonical seed is [`public/worlds/villa-diodati/matrix-state.v1.json`](../public/worlds/villa-diodati/matrix-state.v1.json). Publish it with an operator token and the resolved room ID:

```bash
DIODATI_ROOM_ID='!room-id:matrix.castalia.institute' \
MATRIX_ACCESS_TOKEN='…' \
scripts/publish-diodati-room-state.sh
```

Verify that the event exists and carries the shared coordinate system:

```bash
TOKEN='…'
ROOM='!room-id:matrix.castalia.institute'
ENCODED_ROOM="$(jq -nr --arg value "$ROOM" '$value|@uri')"
curl -fsS "https://matrix.castalia.institute/_matrix/client/v3/rooms/$ENCODED_ROOM/state" \
  -H "Authorization: Bearer $TOKEN" |
  jq '.[] | select(.type == "org.castalia.salon.room" and (.state_key // "") == "") | .content | {map, coordinate_system, positions: (.positions | length)}'
```

The browser deliberately stays in preview mode until this event is present and compatible; it never promotes the static seed to authoritative state on its own.
