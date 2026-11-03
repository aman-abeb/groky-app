import env, { SAMPLE_RATE } from '../config';
import { grokTools, runTool } from '../devices';
import { fromBase64, toBase64 } from './pcm';
import { Player } from './player';

export type Status = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'acting';

export type Line =
  | { id: string; kind: 'user' | 'grok'; text: string }
  | { id: string; kind: 'tool'; name: string; args: string; ok?: boolean; ms?: number }
  | { id: string; kind: 'error'; text: string };

type Events = {
  status: (s: Status) => void;
  line: (l: Line) => void;
};

const PROMPT = `You are Groky, the voice of a small robot crew at the Ctrl+Alt Museum in Pavia: a robot dog and a robot arm.
Talk like a friendly person, short sentences, one or two at a time. No lists, no markdown.
When asked to do something physical, call the matching tool, then say briefly what happened.
After arm_pick_place always call arm_check to verify. If a tool fails, say so honestly and offer to retry.
If someone says stop, call stop first, talk after.
Answer in the language the user speaks.`;

async function getToken(): Promise<string> {
  if (env.tokenUrl) {
    const r = await fetch(env.tokenUrl, { method: 'POST' });
    if (!r.ok) throw new Error(`token server ${r.status}`);
    const j = await r.json();
    // response shape isn't documented, accept the usual suspects
    const t = j.value ?? j.client_secret?.value ?? j.token ?? j.secret;
    if (!t) throw new Error('token server returned no token');
    return t;
  }
  if (env.xaiKey) return env.xaiKey;
  throw new Error('No EXPO_PUBLIC_TOKEN_URL or EXPO_PUBLIC_XAI_API_KEY in .env');
}

let seq = 0;
const uid = () => `${Date.now().toString(36)}${seq++}`;

export class VoiceSession {
  private ws: WebSocket | null = null;
  private player = new Player();
  private calls: Promise<{ call_id: string; output: string }>[] = [];
  private grokLine: Line | null = null;
  private userLineId: string | null = null;
  private _status: Status = 'off';

  constructor(private on: Events) {
    this.player.onDone = () => {
      if (this._status === 'speaking') this.set('listening');
    };
  }

  get status() {
    return this._status;
  }

  // mic only goes up while we're listening - phone speaker would otherwise trigger VAD on itself
  get wantsAudio() {
    return this._status === 'listening' || this._status === 'thinking';
  }

  async start() {
    this.set('connecting');
    let token: string;
    try {
      token = await getToken();
    } catch (e: any) {
      this.error(e.message);
      this.set('off');
      return;
    }

    const url = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(env.voiceModel)}`;
    // RN's WebSocket accepts headers, unlike the browser one
    const ws = new (WebSocket as any)(url, null, {
      headers: { Authorization: `Bearer ${token}` },
    }) as WebSocket;
    this.ws = ws;

    ws.onopen = () => {
      this.send({
        type: 'session.update',
        session: {
          instructions: PROMPT,
          voice: env.voice,
          turn_detection: { type: 'server_vad' },
          audio: {
            input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
            output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
          },
          tools: grokTools(),
        },
      });
      this.set('listening');
    };
    ws.onmessage = (m) => this.handle(JSON.parse(m.data as string));
    ws.onerror = () => this.error('connection error');
    ws.onclose = (e) => {
      if (this.ws === ws) {
        if (e.code !== 1000) this.error(`closed (${e.code}) ${e.reason ?? ''}`.trim());
        this.ws = null;
        this.player.stop();
        this.set('off');
      }
    };
  }

  stop() {
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    this.player.stop();
    this.calls = [];
    this.set('off');
  }

  appendAudio(pcm: ArrayBuffer) {
    if (this.wantsAudio) this.send({ type: 'input_audio_buffer.append', audio: toBase64(pcm) });
  }

  say(text: string) {
    this.line({ id: uid(), kind: 'user', text });
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
    this.send({ type: 'response.create' });
    this.set('thinking');
  }

  async emergencyStop() {
    this.player.stop();
    const t0 = Date.now();
    const res = await runTool('stop', {});
    this.line({ id: uid(), kind: 'tool', name: 'stop', args: 'button', ok: res.ok, ms: Date.now() - t0 });
    if (this.ws) this.set('listening');
  }

  private handle(ev: any) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        this.userLineId = null;
        break;

      case 'input_audio_buffer.speech_stopped':
        this.set('thinking');
        break;

      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed': {
        const text = ev.transcript ?? ev.delta;
        if (!text) break;
        this.userLineId ??= uid();
        this.line({ id: this.userLineId, kind: 'user', text });
        break;
      }

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.player.push(fromBase64(ev.delta));
        break;

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const prev = this.grokLine?.kind === 'grok' ? this.grokLine.text : '';
        this.grokLine = { id: this.grokLine?.id ?? uid(), kind: 'grok', text: prev + ev.delta };
        this.line(this.grokLine);
        break;
      }

      case 'response.function_call_arguments.done':
        this.set('acting');
        this.calls.push(this.call(ev.name, ev.call_id, ev.arguments));
        break;

      case 'response.done':
        this.grokLine = null;
        this.finishTurn();
        break;

      case 'error':
        this.error(ev.error?.message ?? ev.message ?? 'unknown error');
        break;
    }
  }

  private async call(name: string, call_id: string, raw: string) {
    const id = uid();
    this.line({ id, kind: 'tool', name, args: raw });
    const t0 = Date.now();
    let args = {};
    try {
      args = JSON.parse(raw || '{}');
    } catch {}
    const res = await runTool(name, args);
    this.line({ id, kind: 'tool', name, args: raw, ok: res.ok, ms: Date.now() - t0 });
    return { call_id, output: JSON.stringify(res) };
  }

  private async finishTurn() {
    const calls = this.calls;
    this.calls = [];

    if (!calls.length) {
      if (this.player.pending) {
        this.set('speaking');
        await this.player.flush();
      } else if (this._status !== 'off') {
        this.set('listening');
      }
      return;
    }

    // speak whatever Grok said before the tool call while the robot moves,
    // then hand results back only after playback so audio doesn't overlap
    const spoken = new Promise<void>((resolve) => {
      if (!this.player.pending) return resolve();
      const prev = this.player.onDone;
      this.player.onDone = () => {
        this.player.onDone = prev;
        resolve();
      };
      this.player.flush();
    });

    const [outputs] = await Promise.all([Promise.all(calls), spoken]);
    if (!this.ws) return;
    for (const o of outputs) {
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', ...o } });
    }
    this.send({ type: 'response.create' });
    this.set('thinking');
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private set(s: Status) {
    this._status = s;
    this.on.status(s);
  }

  private line(l: Line) {
    this.on.line(l);
  }

  private error(text: string) {
    this.line({ id: uid(), kind: 'error', text });
  }
}
