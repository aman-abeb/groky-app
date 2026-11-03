import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { devices, DeviceId, ping } from '../devices';
import { Colors, useStyles, useTheme } from '../theme';

type State = 'sim' | 'online' | 'offline' | '...';

export default function DeviceChips() {
  const { c } = useTheme();
  const s = useStyles(makeStyles);
  const [state, setState] = useState<Record<DeviceId, State>>({ dog: '...', arm: '...' });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ids = Object.keys(devices) as DeviceId[];
      const res = await Promise.all(ids.map(ping));
      if (alive) setState(Object.fromEntries(ids.map((id, i) => [id, res[i]])) as Record<DeviceId, State>);
    };
    check();
    const t = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const dot: Record<State, string> = { sim: c.warn, online: c.ok, offline: c.bad, '...': c.faint };

  return (
    <View style={s.row}>
      {(Object.keys(devices) as DeviceId[]).map((id) => (
        <View key={id} style={s.chip}>
          <View style={[s.dot, { backgroundColor: dot[state[id]] }]} />
          <Text style={s.label}>{devices[id].label}</Text>
          <Text style={s.state}>{state[id]}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.panel,
      borderWidth: 1,
      borderColor: c.line,
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    label: { color: c.text, fontSize: 13, fontWeight: '600' },
    state: { color: c.dim, fontSize: 12 },
  });
