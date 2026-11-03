import env from '../config';

export type DeviceId = 'dog' | 'arm';

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});

// Kept small on purpose. Names map 1:1 to POST {bridge}/tools/{name} on the laptop side.
// Rename/extend once we know the actual hardware on Wednesday morning.
const dogTools: Tool[] = [
  {
    name: 'walk',
    description: 'Walk the robot dog. Positive meters forward, negative backward.',
    parameters: obj({ meters: { type: 'number', minimum: -2, maximum: 2 } }, ['meters']),
  },
  {
    name: 'turn',
    description: 'Turn in place. Positive degrees = left.',
    parameters: obj({ degrees: { type: 'number', minimum: -180, maximum: 180 } }, ['degrees']),
  },
  {
    name: 'pose',
    description: 'Put the dog in a pose.',
    parameters: obj({ pose: { type: 'string', enum: ['stand', 'sit', 'lie', 'wave'] } }, ['pose']),
  },
  {
    name: 'look',
    description: "Take a photo with the dog's camera and describe what is in front of it.",
    parameters: obj({}),
  },
];

const armTools: Tool[] = [
  {
    name: 'goto',
    description: 'Move the arm to a named, pre-taught position.',
    parameters: obj({ place: { type: 'string', enum: ['home', 'table', 'box', 'handover'] } }, ['place']),
  },
  {
    name: 'grip',
    description: 'Open or close the gripper.',
    parameters: obj({ state: { type: 'string', enum: ['open', 'close'] } }, ['state']),
  },
  {
    name: 'pick_place',
    description: 'Pick up an object seen by the camera and put it at a target place.',
    parameters: obj(
      {
        object: { type: 'string', description: 'e.g. "red cube"' },
        place: { type: 'string', enum: ['table', 'box', 'handover'] },
      },
      ['object', 'place'],
    ),
  },
  {
    name: 'check',
    description: 'Photo of the workspace, verified by vision. Use after pick_place to confirm it worked.',
    parameters: obj({ expect: { type: 'string' } }, ['expect']),
  },
];

export const devices: Record<DeviceId, { label: string; url: string; tools: Tool[] }> = {
  dog: { label: 'Dog', url: env.dogUrl, tools: dogTools },
  arm: { label: 'Arm', url: env.armUrl, tools: armTools },
};

const stopTool: Tool = {
  name: 'stop',
  description: 'Emergency stop for every device. Call immediately if the user says stop, wait, halt or similar.',
  parameters: obj({}),
};

// Grok sees one flat list: dog_walk, arm_grip, ...
export function grokTools() {
  const list = Object.entries(devices).flatMap(([id, d]) =>
    d.tools.map((t) => ({ type: 'function', ...t, name: `${id}_${t.name}` })),
  );
  return [...list, { type: 'function', ...stopTool }];
}

export type ToolResult = { ok: boolean; sim?: boolean; [k: string]: unknown };

async function post(url: string, body: unknown, ms = 15000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': env.bridgeKey },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, status: res.status, ...data };
  } finally {
    clearTimeout(t);
  }
}

export async function runTool(fullName: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (fullName === 'stop') {
    const all = await Promise.allSettled(
      Object.entries(devices).map(([id, d]) =>
        d.url ? post(`${d.url}/tools/stop`, {}, 3000) : Promise.resolve({ ok: true, sim: true, id }),
      ),
    );
    return { ok: all.every((r) => r.status === 'fulfilled'), stopped: Object.keys(devices) };
  }

  const [id, ...rest] = fullName.split('_');
  const name = rest.join('_');
  const dev = devices[id as DeviceId];
  if (!dev) return { ok: false, error: `unknown tool ${fullName}` };

  if (!dev.url) return simulate(id as DeviceId, name, args);

  try {
    return await post(`${dev.url}/tools/${name}`, args);
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e) };
  }
}

export async function ping(id: DeviceId): Promise<'sim' | 'online' | 'offline'> {
  const url = devices[id].url;
  if (!url) return 'sim';
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(`${url}/health`, { signal: ctl.signal });
    return r.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(t);
  }
}

// Fake device so the voice side can be built without hardware.
async function simulate(id: DeviceId, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
  if (name === 'look') return { ok: true, sim: true, seen: 'a table with an old Commodore 64 and a keyboard' };
  if (name === 'check') return { ok: Math.random() > 0.2, sim: true, expect: args.expect };
  return { ok: true, sim: true, device: id, did: name, args };
}
