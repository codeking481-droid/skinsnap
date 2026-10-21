import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadRoutineProgress, saveRoutineProgress } from '../routineStorage';
import { backOrReplace } from '../navigation';
import { loadRoutineProgressFromAccount, syncRoutineProgress } from '../services/userDataApi';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MORNING = [
  ['Cleanser', 'Gentle foaming cleanser', 'pump'],
  ['Toner', 'Hydrating toner', 'toner'],
  ['Serum', 'Niacinamide serum', 'dropper'],
  ['Moisturizer', 'Lightweight moisturizer', 'jar'],
  ['Sunscreen', 'Broad spectrum SPF 30+', 'tube'],
] as const;
const EVENING = [
  ['Cleanser', 'Gentle foaming cleanser', 'pump'],
  ['Toner', 'Hydrating toner', 'toner'],
  ['Serum', 'Niacinamide serum', 'dropper'],
  ['Moisturizer', 'Lightweight moisturizer', 'jar'],
] as const;

export default function RoutineScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<'Morning' | 'Evening'>('Morning');
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Loading your routine…');
  useEffect(() => {
    let active = true;
    loadRoutineProgress().then(async (stored) => {
      if (!active) return;
      let initial = stored;
      try {
        const remote = await loadRoutineProgressFromAccount();
        if (remote) {
          initial = {
            checkedSteps: [...new Set([...stored.checkedSteps, ...remote.checkedSteps])],
            completedDays: [...new Set([...stored.completedDays, ...remote.completedDays])],
          };
          setSyncStatus('Account data loaded');
        } else {
          setSyncStatus('Saved on this device');
        }
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : 'Account sync is unavailable; your local routine is still available.');
      }
      if (!active) return;
      setChecked(initial.checkedSteps);
      setCompletedDays(initial.completedDays);
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return undefined;
    const snapshot = { checkedSteps: checked, completedDays };
    const timeout = setTimeout(() => {
      void (async () => {
        let localSaveFailed = false;
        try {
          await saveRoutineProgress(snapshot);
        } catch {
          localSaveFailed = true;
        }
        try {
          const result = await syncRoutineProgress(snapshot);
          setSyncStatus(localSaveFailed
            ? result === 'synced' ? 'Account synced; this device could not save a local copy.' : 'Could not save your routine on this device.'
            : result === 'synced' ? 'Synced securely to your account' : 'Saved on this device');
        } catch (error) {
          setSyncStatus(localSaveFailed
            ? 'Could not save or sync your routine.'
            : error instanceof Error ? error.message : 'Could not sync your routine. Your local copy is saved.');
        }
      })();
    }, 450);
    return () => clearTimeout(timeout);
  }, [checked, completedDays, loaded]);
  const scale = Math.max(1, Math.min(Math.min(width, 520) / 393, 1.08));
  const items = period === 'Morning' ? MORNING : EVENING;
  const today = new Date();
  const currentDay = DAYS[(today.getDay() + 6) % 7];
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = DAYS.map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const todayKey = weekDates[DAYS.indexOf(currentDay)];
  const toggleStep = (id: string) => {
    const next = checked.includes(id) ? checked.filter((value) => value !== id) : [...checked, id];
    setChecked(next);
    const dayComplete = [...MORNING.map((item) => `Morning-${item[0]}`), ...EVENING.map((item) => `Evening-${item[0]}`)].every((stepId) => next.includes(stepId));
    setCompletedDays((current) => dayComplete ? [...new Set([...current, todayKey])] : current.filter((key) => key !== todayKey));
  };
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
    <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 21 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 16 * scale) }]}>
      <LinearGradient colors={['#09070B', '#050509', '#050509']} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.headingRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to recommendations" onPress={() => backOrReplace('/recommendations')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}><Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg></Pressable>
        <Text style={[styles.title, { fontSize: 30 * scale, lineHeight: 40 * scale }]}>Your <Text style={styles.pink}>Routine</Text></Text><View style={{ width: 34 * scale }} />
      </View>
      <Text style={[styles.demoNotice, { fontSize: 9 * scale, marginTop: 3 * scale }]}>DEMO ROUTINE · GENERAL EXAMPLE, NOT PERSONALISED</Text>
      <Text accessibilityLiveRegion="polite" style={[styles.syncStatus, { fontSize: 9 * scale, marginTop: 4 * scale }]}>{syncStatus}</Text>

      <View style={[styles.week, { marginTop: 10 * scale }]}>{DAYS.map((day, index) => {
        const active = completedDays.includes(weekDates[index]);
        const isToday = day === currentDay;
        return <View key={day} accessibilityLabel={`${day}${isToday ? ', today' : ''}${active ? ', completed' : ''}`} style={styles.day}>
          <Text style={[styles.dayLabel, { fontSize: 12 * scale, color: isToday ? '#FF5E94' : '#CBD2DC' }]}>{day}</Text>
          <View style={[styles.dayCircle, { width: 30 * scale, height: 30 * scale, borderRadius: 16 * scale, borderColor: active ? (isToday ? '#FF5D94' : '#D7E2F0') : day === 'Sun' ? '#62314A' : '#30333B', backgroundColor: isToday && active ? '#FF5D94' : 'transparent', borderWidth: active ? 1.4 : 1.1 }]}>{active && <Svg width={17 * scale} height={17 * scale} viewBox="0 0 24 24" fill="none" stroke={isToday ? '#08090D' : '#FFF'} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg>}</View>
        </View>;
      })}</View>

      <View style={[styles.tabs, { marginTop: 10 * scale, borderRadius: 21 * scale }]}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: period === 'Morning' }} onPress={() => setPeriod('Morning')} style={[styles.tab, { borderTopLeftRadius: 21 * scale, borderBottomLeftRadius: 21 * scale }, period === 'Morning' && styles.activeTab]}><Text style={[styles.tabText, { fontSize: 14 * scale, color: period === 'Morning' ? '#09090D' : '#F4F3F6' }]}>Morning</Text><SunIcon size={20 * scale} color={period === 'Morning' ? '#09090D' : '#FFF'} /></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: period === 'Evening' }} onPress={() => setPeriod('Evening')} style={[styles.tab, { borderTopRightRadius: 21 * scale, borderBottomRightRadius: 21 * scale }, period === 'Evening' && styles.activeTab]}><Text style={[styles.tabText, { fontSize: 14 * scale, color: period === 'Evening' ? '#09090D' : '#F4F3F6' }]}>Evening</Text><MoonIcon size={19 * scale} color={period === 'Evening' ? '#09090D' : '#FFF'} /></Pressable>
      </View>

      <View style={[styles.steps, { gap: 6 * scale, marginTop: 10 * scale }]}>{items.map(([title, detail, product], index) => {
        const id = `${period}-${title}`;
        const done = checked.includes(id);
        return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked: done }} onPress={() => toggleStep(id)} style={[styles.stepRow, { height: 76 * scale, gap: 6 * scale }]}>
          <ProductPack type={product} size={74 * scale} />
          <View style={[styles.productCard, { borderRadius: 15 * scale, paddingHorizontal: 10 * scale, gap: 10 * scale }]}>
            <View style={[styles.number, { width: 34 * scale, height: 34 * scale, borderRadius: 18 * scale }]}><Text style={[styles.numberText, { fontSize: 20 * scale }]}>{index + 1}</Text></View>
            <View style={styles.stepCopy}><Text style={[styles.stepTitle, { fontSize: 16 * scale, lineHeight: 21 * scale }]}>{title}</Text><Text style={[styles.stepDetail, { fontSize: 14 * scale, lineHeight: 19 * scale, marginTop: 2 * scale }]}>{detail}</Text></View>
            {done && <View style={styles.doneDot}><Svg width={12 * scale} height={12 * scale} viewBox="0 0 24 24" fill="none" stroke="#0A090D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg></View>}
            <Svg width={17 * scale} height={17 * scale} viewBox="0 0 24 24" fill="none" stroke="#FF6497" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="m9 18 6-6-6-6" /></Svg>
          </View>
        </Pressable>;
      })}</View>

      <View style={[styles.proTip, { borderRadius: 16 * scale, padding: 15 * scale, gap: 14 * scale, marginTop: 14 * scale }]}>
        <View style={[styles.tipIcon, { width: 50 * scale, height: 50 * scale, borderRadius: 13 * scale }]}><TipBulb size={31 * scale} /></View>
        <View style={styles.tipCopy}><Text style={[styles.tipTitle, { fontSize: 16 * scale, lineHeight: 21 * scale }]}>Pro Tip</Text><Text style={[styles.tipText, { fontSize: 14 * scale, lineHeight: 19 * scale, marginTop: 3 * scale }]}>Follow this routine daily for the best results. Consistency is key!</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={[styles.cta, { minHeight: 54 * scale, borderRadius: 28 * scale, marginTop: 14 * scale }]}><LinearGradient colors={['#FF6494', '#FF6794', '#FF6B99']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 17 * scale }]}>Track My Progress</Text><Svg width={21 * scale} height={21 * scale} viewBox="0 0 24 24" fill="none" stroke="#08090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg></LinearGradient></Pressable>
    </View>
  </ScrollView></View>;
}

function ProductPack({ type, size }: { type: string; size: number }) {
  return <View style={[styles.pack, { width: size, height: size, borderRadius: 11 }]}><Svg width={size * 0.63} height={size * 0.86} viewBox="0 0 70 96">
    <Rect x="2" y="2" width="66" height="92" rx="10" fill="#FDFDFE" />
    {type === 'pump' && <><Rect x="29" y="9" width="12" height="8" rx="2" fill="#E6E9E9" /><Rect x="33" y="4" width="4" height="7" fill="#CDD2D2" /><Path d="M35 4h14" stroke="#CCD1D2" strokeWidth="3" strokeLinecap="round" /><Rect x="19" y="18" width="32" height="66" rx="8" fill="#F7F8F8" stroke="#DDE2E1" /><Rect x="21" y="43" width="28" height="23" rx="2" fill="#FFF" stroke="#D8DFDD" /><Path d="M22 47h13" stroke="#38B79B" strokeWidth="3" /><Path d="M22 54h22M22 59h17" stroke="#AEB7B5" strokeWidth="1.5" /></>}
    {type === 'toner' && <><Path d="M28 11h14v10H28z" fill="#121313" /><Path d="M32 5h7v7h-7z" fill="#0C0D0D" /><Rect x="23" y="20" width="24" height="67" rx="7" fill="#6D361B" /><Rect x="25" y="44" width="20" height="27" rx="2" fill="#F9F7F2" /><Path d="M28 50h14M28 54h12M28 58h9" stroke="#6E6B67" strokeWidth="1.4" /></>}
    {type === 'dropper' && <><Rect x="30" y="7" width="10" height="11" rx="3" fill="#141414" /><Path d="M33 18h4l2 9h-8z" fill="#171717" /><Rect x="20" y="26" width="30" height="59" rx="7" fill="#CC791B" /><Rect x="23" y="46" width="24" height="22" rx="2" fill="#FCFBF7" /><Path d="M26 51h18" stroke="#ECA33D" strokeWidth="2.4" /><Path d="M26 56h14M26 60h16" stroke="#B9B2A7" strokeWidth="1.4" /></>}
    {type === 'jar' && <><Path d="M18 28h34v8H18z" fill="#EEF0F0" stroke="#DDE1E0" /><Rect x="20" y="36" width="30" height="47" rx="8" fill="#FDFDFD" stroke="#E2E5E5" /><Rect x="24" y="50" width="22" height="18" rx="2" fill="#FFF" /><Path d="M26 54h10" stroke="#35B89B" strokeWidth="2.5" /><Path d="M26 59h14M26 63h12" stroke="#B5BCBB" strokeWidth="1.3" /></>}
    {type === 'tube' && <><Path d="m22 16 26 0 5 57H17z" fill="#FFFCF8" stroke="#E2E3E4" /><Rect x="26" y="10" width="18" height="7" rx="2" fill="#F1F1EF" /><Rect x="25" y="42" width="20" height="20" rx="2" fill="#FFF" /><Path d="M26 45h8" stroke="#F28B25" strokeWidth="4" /><Path d="M27 52h15M27 56h13" stroke="#B6B7B9" strokeWidth="1.4" /><Rect x="27" y="72" width="16" height="10" rx="3" fill="#EFEFEF" /></>}
  </Svg></View>;
}
function SunIcon({ size, color }: { size: number; color: string }) { return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round"><Circle cx="12" cy="12" r="4" fill={color} />{Array.from({ length: 8 }, (_, i) => <Path key={i} d="M12 1.5v2.6" transform={`rotate(${i * 45} 12 12)`} />)}</Svg>; }
function MoonIcon({ size, color }: { size: number; color: string }) { return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M20.5 15.5A8.8 8.8 0 0 1 8.5 3.5 9.5 9.5 0 1 0 20.5 15.5Z" /></Svg>; }
function TipBulb({ size }: { size: number }) { return <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#FF75A2" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M13 25c0-4-5-6-5-12a12 12 0 0 1 24 0c0 6-5 8-5 12M14 29h12m-9 4h6m-3-22v12" /></Svg>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' }, scroll: { flexGrow: 1, alignItems: 'center' }, page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509' }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { justifyContent: 'center' }, title: { color: '#F7F6F9', fontFamily: 'InterExtraBold', letterSpacing: -0.8 }, pink: { color: '#FF5A91' }, demoNotice: { alignSelf: 'center', color: '#97909B', fontFamily: 'InterMedium', textAlign: 'center', letterSpacing: 0.55 }, syncStatus: { alignSelf: 'center', color: '#D7A7B9', fontFamily: 'InterRegular', textAlign: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between' }, day: { flex: 1, alignItems: 'center', gap: 6 }, dayLabel: { fontFamily: 'InterMedium' }, dayCircle: { alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(12,13,18,0.97)', borderWidth: 1, borderColor: '#383640' }, tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 }, activeTab: { backgroundColor: '#FF6094' }, tabText: { fontFamily: 'InterSemibold' },
  steps: { width: '100%' }, stepRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch' }, pack: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFDFE' }, productCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,12,17,0.94)', borderWidth: 1, borderColor: '#292C34' }, number: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(85,28,49,0.85)', borderWidth: 0.9, borderColor: '#BD3A68' }, numberText: { color: '#FFF', fontFamily: 'InterExtraBold' }, stepCopy: { flex: 1, minWidth: 0 }, stepTitle: { color: '#F7F6F9', fontFamily: 'InterSemibold' }, stepDetail: { color: '#C2C8D2', fontFamily: 'InterRegular' }, doneDot: { position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6294' },
  proTip: { width: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderColor: '#FF4788', backgroundColor: 'rgba(34,10,24,0.86)', boxShadow: '0px 0px 16px rgba(255,58,126,0.3)' }, tipIcon: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DD3D75', backgroundColor: 'rgba(75,22,44,0.9)' }, tipCopy: { flex: 1 }, tipTitle: { color: '#FF5D94', fontFamily: 'InterSemibold' }, tipText: { color: '#C4CAD5', fontFamily: 'InterRegular' },
  cta: { width: '100%', overflow: 'hidden', boxShadow: '0px 0px 24px 2px rgba(255,68,128,0.4)' }, ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, ctaText: { color: '#08090D', fontFamily: 'InterExtraBold' },
});
