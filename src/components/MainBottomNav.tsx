import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type MainTab = 'home' | 'scan' | 'diary' | 'profile';
type TabName = MainTab | null;

function TabGlyph({ icon, active }: { icon: MainTab; active: boolean }) {
  const color = active ? '#E8C9A0' : '#777477';
  return (
    <Svg width={27} height={27} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      {icon === 'home' && <Path d="m4 14 12-10 12 10v13a1 1 0 0 1-1 1h-8v-9h-6v9H5a1 1 0 0 1-1-1V14Z" fill={active ? color : 'none'} />}
      {icon === 'scan' && <><Path d="M5 12V8a3 3 0 0 1 3-3h4m8 0h4a3 3 0 0 1 3 3v4M5 20v4a3 3 0 0 0 3 3h4m8 0h4a3 3 0 0 0 3-3v-4" /><Circle cx="16" cy="15" r="5" /></>}
      {icon === 'diary' && <><Rect x="7" y="4" width="21" height="25" rx="3" /><Path d="M12 10h11m-11 6h11m-11 6h7M4 8v18" /></>}
      {icon === 'profile' && <><Circle cx="16" cy="10" r="6" fill={active ? color : 'none'} /><Path d="M5 28c0-6 4-10 11-10s11 4 11 10" fill={active ? color : 'none'} /></>}
    </Svg>
  );
}

function Tab({ icon, label, active, onPress }: { icon: MainTab; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tab}>
      <TabGlyph icon={icon} active={active} />
      <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>{label}</Text>
    </Pressable>
  );
}

export function MainBottomNav({ active, bottomInset = 0, onScan }: { active: TabName; bottomInset?: number; onScan?: () => void }) {
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 10), paddingTop: 10 }]}>
      <Tab icon="home" label="Home" active={active === 'home'} onPress={() => router.replace('/')} />
      <Tab icon="scan" label="Scan" active={active === 'scan'} onPress={onScan ?? (() => router.push('/upload'))} />
      <Tab icon="diary" label="Diary" active={active === 'diary'} onPress={() => router.push('/skin-diary')} />
      <Tab icon="profile" label="Profile" active={active === 'profile'} onPress={() => router.push('/settings')} />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: { width: '100%', minHeight: 78, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#262628', backgroundColor: '#1A1A1C' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 3 },
  tabLabel: { color: '#888589', fontFamily: 'InterMedium', fontSize: 11 },
  activeTabLabel: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
});
