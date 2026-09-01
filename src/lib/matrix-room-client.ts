/**
 * Lightweight Matrix room client (polling) for static Salon pages.
 * Mirrors castalia.institute/lib/matrix/client.ts using Vite PUBLIC_* env.
 */

export interface MatrixMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  event?: unknown;
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
  private isConnected = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private seenMessageIds = new Set<string>();

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

  async sendMessage(content: string): Promise<string> {
    if (!this.isConnected) throw new Error('Not connected to Matrix room');

    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error('Configure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY to send messages');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/matrix-send-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
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
            content?: { body?: string };
            origin_server_ts?: number;
          }) => ({
            id: event.event_id,
            sender: event.sender || 'unknown',
            content: event.content?.body || '',
            timestamp: event.origin_server_ts || Date.now(),
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
    this.seenMessageIds.clear();
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
