import { useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Orb from './src/components/Orb';
import ControlBar from './src/components/ControlBar';
import DeviceChips from './src/components/DeviceChips';
import Log from './src/components/Log';
import Settings from './src/components/Settings';
import { useVoice } from './src/voice/useVoice';
import type { Status } from './src/voice/session';
import { Colors, ThemeProvider, useStyles, useTheme } from './src/theme';

const caption: Record<Status, string> = {
  off: 'Tap the mic to wake me up',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Talking',
  acting: 'On it',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Main />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const { c, isDark } = useTheme();
  const s = useStyles(makeStyles);
  const level = useRef(new Animated.Value(0)).current;
  const voice = useVoice((v) => level.setValue(v));
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const live = voice.status !== 'off';
  const lastGrok = [...voice.lines].reverse().find((l) => l.kind === 'grok');
  const headline = lastGrok?.kind === 'grok' ? lastGrok.text : 'hi, what should we build today?';

  const onMic = () => {
    if (!live) voice.start();
    else voice.setMuted(!voice.muted);
  };

  const stop = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    voice.emergencyStop();
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={s.top}>
        <DeviceChips />
        <View style={s.topRight}>
          <Pressable onPress={voice.clear} style={s.topBtn} hitSlop={8}>
            <Ionicons name="add" size={22} color={c.text} />
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} style={s.topBtn} hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={c.text} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {logOpen ? (
          <Log lines={voice.lines} canSend={live} onSend={voice.say} />
        ) : (
          <View style={s.stage}>
            <Text style={s.headline} numberOfLines={4}>
              {headline}
            </Text>
            <Orb status={voice.status} level={level} />
            <Text style={s.caption}>{voice.muted && live ? 'Muted' : caption[voice.status]}</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {live && (
        <Pressable onPress={stop} style={({ pressed }) => [s.stop, pressed && { opacity: 0.7 }]}>
          <Ionicons name="hand-left" size={16} color="#fff" />
          <Text style={s.stopText}>STOP ROBOTS</Text>
        </Pressable>
      )}

      <ControlBar
        live={live}
        muted={voice.muted}
        logOpen={logOpen}
        onLog={() => setLogOpen((o) => !o)}
        onMic={onMic}
        onEnd={voice.end}
      />
      <Text style={s.foot}>Grok can get things wrong. Keep a hand near the stop button.</Text>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    topRight: { flexDirection: 'row', gap: 8 },
    topBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.panel,
      borderWidth: 1,
      borderColor: c.line,
    },
    stage: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 28 },
    headline: { color: c.text, fontSize: 26, lineHeight: 36, textAlign: 'center', fontWeight: '500', maxWidth: 640 },
    caption: { color: c.dim, fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
    stop: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.bad,
      paddingHorizontal: 18,
      height: 38,
      borderRadius: 19,
      marginBottom: 14,
    },
    stopText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
    foot: { color: c.faint, fontSize: 11, textAlign: 'center', marginTop: 10, marginBottom: 4 },
  });
