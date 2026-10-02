/**
 * Lightweight Matrix room client (polling) for static Salon pages.
 * Mirrors castalia.institute/lib/matrix/client.ts using Vite PUBLIC_* env.
 */

export interface MatrixMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  cycleId?: string;
  simulatedAt?: string;
  draft?: DiodatiDraft;
  event?: unknown;
}

export interface SalonRoomState {
  map?: 'villa-diodati-salon-v1'
  coordinate_system?: 'villa-diodati-isometric-v1'
  participants?: Record<string, {
    name?: string
    x: number
    z: number
    direction?: string
    state?: 'idle' | 'walk' | 'gesture' | 'sit' | 'speak'
    seat?: string
    scale?: number
    height?: number
    weight?: number
  }>
  positions: Record<string, { x: number; z: number; rotation?: number; animation_state?: 'idle' | 'walk' | 'gesture' | 'sit' | 'speak'; direction?: string; scale?: number; height?: number; weight?: number }>
  avatars?: Record<string, { body?: 'feminine' | 'masculine'; skin?: number; hair?: number; coat?: number; waistcoat?: number; accent?: number; accessories?: string[] }>
  furniture?: Record<string, { kind: 'sofa' | 'armchair' | 'table'; x: number; z: number; rotation?: number }>
  activeSpeaker?: string
  scene?: string
  updatedAt?: string
}

export interface DiodatiDraft {
  stage: 'friday' | 'saturday' | 'sunday';
  revision: number;
  label: string;
  title: string;
  faculty_id: string;
  generated_by: 'ask-faculty';
}

function matrixServer(): string {
  if (typeof import.meta.env !== 'undefined' && import.meta.env.PUBLIC_MATRIX_SERVER) {
    return import.meta.env.PUBLIC_MATRIX_SERVER.replace(/\/$/, '');
  }
  return 'https://matrix.castalia.institute';
}

let guestAccessTokenPromise: Promise<string> | null = null;

async function guestAccessToken(): Promise<string> {
  if (!guestAccessTokenPromise) {
    const MATRIX_SERVER = matrixServer();
    guestAccessTokenPromise = fetch(`${MATRIX_SERVER}/_matrix/client/v3/register?kind=guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Matrix guest registration failed: ${response.status}`);
        }
        const data = await response.json();
        if (!data.access_token) throw new Error('Matrix guest registration returned no access token');
        return data.access_token as string;
      })
      .catch((error) => {
        guestAccessTokenPromise = null;
        throw error;
      });
  }
  return guestAccessTokenPromise;
}

async function matrixRead(path: string): Promise<Response> {
  const token = await guestAccessToken();
  return fetch(`${matrixServer()}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export class MatrixRoomClient {
  private roomId: string;
  private onMessageCallbacks = new Set<(message: MatrixMessage) => void>();
  private onStateCallbacks = new Set<(state: SalonRoomState | null) => void>();
  private isConnected = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private seenMessageIds = new Set<string>();
  private lastStateJson = '';

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    await this.pollMessages();
    this.pollInterval = setInterval(() => {
      this.pollMessages().catch((err) => console.error('Matrix poll error:', err));
    }, 2000);

    this.isConnected = true;
    console.log('Connected to Matrix room (polling):', this.roomId);
  }

  private async pollMessages(): Promise<void> {
    try {
      await this.pollState();
    } catch (e) {
      console.error('Error polling Matrix room state:', e);
    }
    try {
      const response = await matrixRead(
        `/_matrix/client/v3/rooms/${encodeURIComponent(this.roomId)}/messages?dir=b&limit=50`
      );

      if (!response.ok) {
        if (response.status === 403) {
          console.warn('Matrix room requires authentication for reads');
          return;
        }
        throw new Error(`Failed to fetch Matrix messages: ${response.status}`);
      }

      const data = await response.json();
      const events = data.chunk || [];

      for (const event of events) {
        if (event.type !== 'm.room.message') continue;
        if (event.content?.msgtype !== 'm.text') continue;

        const message: MatrixMessage = {
          id: event.event_id,
          sender: event.sender || 'unknown',
          content: event.content.body || '',
          timestamp: event.origin_server_ts || Date.now(),
          cycleId: event.content['org.castalia.salon_cycle'],
          simulatedAt: event.content['org.castalia.simulated_at'],
          draft: event.content['org.castalia.diodati_draft'],
          event,
        };

        if (!this.seenMessageIds.has(message.id)) {
          this.seenMessageIds.add(message.id);
          this.onMessageCallbacks.forEach((cb) => {
            try {
              cb(message);
            } catch (e) {
              console.error(e);
            }
          });
        }
      }
    } catch (e) {
      console.error('Error polling Matrix messages:', e);
    }
  }

  private async pollState(): Promise<void> {
    const response = await matrixRead(`/_matrix/client/v3/rooms/${encodeURIComponent(this.roomId)}/state`)
    if (!response.ok) return
    const events = await response.json() as Array<{ type?: string; state_key?: string; content?: SalonRoomState }>
    const event = events.find((candidate) => candidate.type === 'org.castalia.salon.room' && (candidate.state_key ?? '') === '')
    const state = event?.content ?? null
    const serialized = JSON.stringify(state)
    if (serialized === this.lastStateJson) return
    this.lastStateJson = serialized
    this.onStateCallbacks.forEach((callback) => callback(state))
  }

  async sendMessage(content: string, memberAccessToken?: string): Promise<string> {
    if (!this.isConnected) throw new Error('Not connected to Matrix room');

    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || !memberAccessToken) {
      throw new Error('Configure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY to send messages');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/matrix-send-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberAccessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        room_id: this.roomId,
        message: content,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${error}`);
    }

    const data = await response.json();
    return data.event_id || 'sent';
  }

  onMessage(callback: (message: MatrixMessage) => void): () => void {
    this.onMessageCallbacks.add(callback);
    return () => this.onMessageCallbacks.delete(callback);
  }

  onState(callback: (state: SalonRoomState | null) => void): () => void {
    this.onStateCallbacks.add(callback)
    return () => this.onStateCallbacks.delete(callback)
  }

  async getRoomState(): Promise<SalonRoomState | null> {
    const response = await matrixRead(`/_matrix/client/v3/rooms/${encodeURIComponent(this.roomId)}/state`)
    if (!response.ok) return null
    const events = await response.json() as Array<{ type?: string; state_key?: string; content?: SalonRoomState }>
    return events.find((event) => event.type === 'org.castalia.salon.room' && (event.state_key ?? '') === '')?.content ?? null
  }

  async getRecentMessages(limit = 50): Promise<MatrixMessage[]> {
    try {
      const response = await matrixRead(
        `/_matrix/client/v3/rooms/${encodeURIComponent(this.roomId)}/messages?dir=b&limit=${limit}`
      );

      if (!response.ok) {
        if (response.status === 403) return [];
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }

      const data = await response.json();
      const events = data.chunk || [];

      const messages: MatrixMessage[] = events
        .filter(
          (event: { type?: string; content?: { msgtype?: string } }) =>
            event.type === 'm.room.message' && event.content?.msgtype === 'm.text'
        )
        .map(
          (event: {
            event_id: string;
            sender?: string;
            content?: {
              body?: string;
              'org.castalia.salon_cycle'?: string;
              'org.castalia.simulated_at'?: string;
              'org.castalia.diodati_draft'?: DiodatiDraft;
            };
            origin_server_ts?: number;
          }) => ({
            id: event.event_id,
            sender: event.sender || 'unknown',
            content: event.content?.body || '',
            timestamp: event.origin_server_ts || Date.now(),
            cycleId: event.content?.['org.castalia.salon_cycle'],
            simulatedAt: event.content?.['org.castalia.simulated_at'],
            draft: event.content?.['org.castalia.diodati_draft'],
            event,
          })
        )
        .reverse();

      messages.forEach((m) => this.seenMessageIds.add(m.id));
      return messages;
    } catch (e) {
      console.error('getRecentMessages:', e);
      return [];
    }
  }

  disconnect(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isConnected = false;
    this.onMessageCallbacks.clear();
    this.onStateCallbacks.clear();
    this.seenMessageIds.clear();
    this.lastStateJson = '';
  }
}

/** Resolve #alias:server to room id via directory API */
export async function resolveRoomAlias(aliasInput: string): Promise<string | null> {
  const fullAlias = aliasInput.startsWith('#') ? aliasInput : `#${aliasInput}`;
  const MATRIX_SERVER = matrixServer();
  try {
    const response = await fetch(
      `${MATRIX_SERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(fullAlias)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.room_id ?? null;
  } catch {
    return null;
  }
}
