import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { SAMPLE_RATE } from '../config';
import { level, resample } from './pcm';
import { Line, Status, VoiceSession } from './session';

export function useVoice(onLevel?: (v: number) => void) {
  const [status, setStatus] = useState<Status>('off');
  const [lines, setLines] = useState<Line[]>([]);
  const [muted, setMuted] = useState(false);

  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const levelRef = useRef(onLevel);
  levelRef.current = onLevel;

  const session = useRef<VoiceSession | null>(null);
  if (!session.current) {
    session.current = new VoiceSession({
      status: setStatus,
      line: (l) =>
        setLines((prev) => {
          const i = prev.findIndex((p) => p.id === l.id);
          if (i === -1) return [...prev, l].slice(-200);
          const next = prev.slice();
          next[i] = l;
          return next;
        }),
    });
  }

  const { stream } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (b) => {
      const s = session.current!;
      if (mutedRef.current) return levelRef.current?.(0);
      levelRef.current?.(s.wantsAudio ? level(b.data) : 0);
      // iOS often ignores the requested rate and hands us 48k
      s.appendAudio(resample(b.data, b.sampleRate, SAMPLE_RATE));
    },
  });

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone', 'Groky needs the mic to hear you.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await session.current!.start();
    await stream.start();
  }, [stream]);

  const end = useCallback(() => {
    stream.stop();
    session.current!.stop();
    levelRef.current?.(0);
  }, [stream]);

  useEffect(() => () => end(), [end]);

  return {
    status,
    lines,
    muted,
    setMuted,
    start,
    end,
    say: (t: string) => session.current!.say(t),
    emergencyStop: () => session.current!.emergencyStop(),
    clear: () => setLines([]),
  };
}
