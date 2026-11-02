import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { MainBottomNav } from '../components/MainBottomNav';
import { COSMETIC_CONCERNS, FEELINGS, type DiaryEntry } from '../retention';
import { deleteDiary, loadDiary, saveDiary } from '../services/retentionApi';
import { localDayKey } from '../routineProgressState';

function blankEntry(date = localDayKey()): DiaryEntry {
  return {
    date,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    note: '',
    products: '',
    morningCompleted: false,
    eveningCompleted: false,
    concerns: [],
  };
}

function parseDay(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function displayDay(key: string, options?: Intl.DateTimeFormatOptions): string {
  return parseDay(key).toLocaleDateString(undefined, options ?? { month: 'short', day: 'numeric' });
}

function recentDays(): string[] {
  const today = parseDay(localDayKey());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
}

function dateLabel(key: string): string {
  return key === localDayKey() ? 'Today' : displayDay(key, { weekday: 'short' });
}

function DiaryToggle({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </Pressable>;
}

export default function SkinDiaryScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDayKey());
  const [draft, setDraft] = useState<DiaryEntry>(() => blankEntry());
  const [editorVisible, setEditorVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [editorStatus, setEditorStatus] = useState('');
  const days = recentDays();
  const maxWidth = Math.min(width, 520);
  const selectedEntry = entries.find(entry => entry.date === selectedDate);

  useFocusEffect(useCallback(() => {
    let active = true;
    setReady(false);
    setLoadFailed(false);
    setStatus(loadAttempt ? 'Refreshing your diary…' : '');
    void loadDiary().then(({ entries: saved, recovered, skipped }) => {
      if (!active) return;
      setEntries(saved);
      setReady(true);
      setLoadFailed(false);
      setStatus(skipped
        ? `${skipped} saved ${skipped === 1 ? 'entry was' : 'entries were'} skipped because the data could not be read safely.`
        : recovered
          ? `${recovered} older ${recovered === 1 ? 'entry was' : 'entries were'} restored with optional fields left blank.`
          : '');
    }).catch(error => {
      if (active) {
        setReady(true);
        setLoadFailed(true);
        setStatus(error instanceof Error ? error.message : 'Your private diary could not be loaded.');
      }
    });
    return () => { active = false; };
  }, [loadAttempt]));

  const openEditor = (date = selectedDate) => {
    setEditorStatus('');
    const existing = entries.find(item => item.date === date);
    setDraft(existing ? { ...existing, concerns: [...existing.concerns] } : blankEntry(date));
    setEditorVisible(true);
  };

  const updateDraft = (changes: Partial<DiaryEntry>) => setDraft(current => ({ ...current, ...changes }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveDiary(draft);
      setEntries(items => [...items.filter(item => item.date !== draft.date), draft].sort((a, b) => b.date.localeCompare(a.date)));
      setSelectedDate(draft.date);
      setEditorVisible(false);
      setStatus('Your check-in was saved.');
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Your check-in could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => Alert.alert('Delete this check-in?', `This will permanently remove the entry for ${displayDay(draft.date)}.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        if (busy) return;
        setBusy(true);
        void deleteDiary(draft.date).then(() => {
          setEntries(items => items.filter(item => item.date !== draft.date));
          setEditorVisible(false);
          setStatus('Check-in deleted.');
        }).catch(error => setEditorStatus(error instanceof Error ? error.message : 'The check-in could not be deleted.'))
          .finally(() => setBusy(false));
      },
    },
  ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { width: maxWidth, paddingHorizontal: 19, paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>YOUR PERSONAL LOG</Text>
              <Text accessibilityRole="header" style={styles.heading}>Skin Diary</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open profile settings" onPress={() => router.push('/settings')} style={styles.settingsButton}>
              <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke="#E8C9A0" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><CircleGear /></Svg>
            </Pressable>
          </View>
          <Text style={styles.intro}>Notice patterns over time with simple, personal check-ins.</Text>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarTitleRow}>
            <Text style={styles.cardTitle}>{displayDay(localDayKey(), { month: 'long', year: 'numeric' })}</Text>
            <Text style={styles.calendarHint}>LAST 7 DAYS</Text>
          </View>
          <View style={styles.week}>
            {days.map(day => {
              const chosen = selectedDate === day;
              const hasEntry = entries.some(item => item.date === day);
              return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: chosen }} onPress={() => setSelectedDate(day)} style={[styles.day, chosen && styles.daySelected]}>
                <Text style={[styles.dayName, chosen && styles.dayNameSelected]}>{dateLabel(day)}</Text>
                <Text style={[styles.dayNumber, chosen && styles.dayNumberSelected]}>{parseDay(day).getDate()}</Text>
                <View style={[styles.dayDot, hasEntry && styles.dayDotFilled, chosen && styles.dayDotChosen]} />
              </Pressable>;
            })}
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryMark}><Text style={styles.summaryMarkText}>✦</Text></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryLabel}>{selectedEntry ? 'CHECK-IN SAVED' : 'A MOMENT FOR YOU'}</Text>
            <Text style={styles.summaryTitle}>{selectedEntry?.feeling ?? (selectedDate === localDayKey() ? 'How is your skin feeling today?' : 'No check-in for this day')}</Text>
            <Text style={styles.summaryDetail}>{selectedEntry
              ? `${selectedEntry.concerns.length} personal ${selectedEntry.concerns.length === 1 ? 'note' : 'notes'} · ${displayDay(selectedDate)}`
              : 'A quick note can help you notice your own patterns.'}</Text>
          </View>
        </View>

        <View style={styles.timelineHeading}>
          <Text style={styles.cardTitle}>Recent entries</Text>
          {entries.length > 0 && <Text style={styles.entryCount}>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</Text>}
        </View>

        {!ready
          ? <ActivityIndicator color="#E8C9A0" style={styles.spinner} />
          : loadFailed
            ? <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Your diary is ready offline</Text>
              <Text style={styles.emptyText}>We could not refresh remote entries, but saved entries on this device are still available.</Text>
              <Pressable accessibilityRole="button" onPress={() => setLoadAttempt(attempt => attempt + 1)} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Try again</Text></Pressable>
            </View>
          : entries.length
            ? entries.map(entry => <Pressable key={entry.date} onPress={() => openEditor(entry.date)} style={styles.entryCard}>
              <View style={styles.entryDate}>
                <Text style={styles.entryDay}>{displayDay(entry.date, { day: '2-digit' })}</Text>
                <Text style={styles.entryMonth}>{displayDay(entry.date, { month: 'short' }).toUpperCase()}</Text>
              </View>
              <View style={styles.entryContent}>
                <View style={styles.entryTitleRow}>
                  <Text style={styles.entryFeeling}>{entry.feeling ?? 'Skin check-in'}</Text>
                  <Text style={styles.entryChevron}>›</Text>
                </View>
                {entry.note ? <Text numberOfLines={2} style={styles.entryNote}>{entry.note}</Text> : null}
                <View style={styles.entryMeta}>
                  {entry.morningCompleted && <Text style={styles.metaPill}>AM routine</Text>}
                  {entry.eveningCompleted && <Text style={styles.metaPill}>PM routine</Text>}
                  {entry.concerns.slice(0, 2).map(concern => <Text key={concern} style={styles.metaPill}>{concern}</Text>)}
                </View>
              </View>
            </Pressable>)
            : <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✧</Text></View>
              <Text style={styles.emptyTitle}>Your diary starts here</Text>
              <Text style={styles.emptyText}>Save how your skin feels and what you notice. Your check-ins are your own notes, not AI analysis or measurements.</Text>
              <Pressable accessibilityRole="button" onPress={() => openEditor()} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Add your first check-in</Text></Pressable>
            </View>}

        <View style={styles.transparencyCard}>
          <Text style={styles.transparencyTitle}>Your notes, your perspective</Text>
          <Text style={styles.transparencyText}>Diary check-ins save how you describe your skin and routine. They do not include analysis photos, skin scores or medical conclusions.</Text>
        </View>
        {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
      </ScrollView>

      {entries.length > 0 && <Pressable accessibilityRole="button" onPress={() => openEditor()} style={[styles.fab, { bottom: Math.max(insets.bottom, 10) + 89 }]}><Text style={styles.fabPlus}>+</Text><Text style={styles.fabText}>New check-in</Text></Pressable>}
      <MainBottomNav active="diary" bottomInset={insets.bottom} />

      <Modal visible={editorVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditorVisible(false)}>
        <SafeAreaView style={styles.editorScreen} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.editorHeader}>
            <Pressable accessibilityRole="button" onPress={() => setEditorVisible(false)} style={styles.editorClose}><Text style={styles.editorCloseText}>×</Text></Pressable>
            <Text accessibilityRole="header" style={styles.editorTitle}>{entries.some(item => item.date === draft.date) ? 'Edit check-in' : 'New check-in'}</Text>
            <View style={styles.editorClose} />
          </View>
          <ScrollView contentContainerStyle={[styles.editorContent, { width: maxWidth, paddingHorizontal: 20, paddingBottom: 30 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.editorDate}>{displayDay(draft.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
            <Text style={styles.fieldLabel}>How does your skin feel?</Text>
            <View style={styles.chipList}>
              {FEELINGS.map(feeling => <DiaryToggle key={feeling} label={feeling} selected={draft.feeling === feeling} onPress={() => updateDraft({ feeling: draft.feeling === feeling ? undefined : feeling })} />)}
            </View>
            <Text style={styles.fieldLabel}>What did you notice?</Text>
            <View style={styles.chipList}>
              {COSMETIC_CONCERNS.map(concern => {
                const selected = draft.concerns.includes(concern);
                return <DiaryToggle key={concern} label={concern} selected={selected} onPress={() => updateDraft({ concerns: selected ? draft.concerns.filter(item => item !== concern) : [...draft.concerns, concern] })} />;
              })}
            </View>
            <Text style={styles.fieldLabel}>A note to yourself <Text style={styles.optional}>OPTIONAL</Text></Text>
            <TextInput value={draft.note} onChangeText={note => updateDraft({ note })} placeholder="Anything you would like to remember?" placeholderTextColor="#777274" maxLength={600} multiline textAlignVertical="top" style={[styles.textInput, styles.noteInput]} />
            <Text style={styles.fieldLabel}>Products used <Text style={styles.optional}>OPTIONAL</Text></Text>
            <TextInput value={draft.products} onChangeText={products => updateDraft({ products })} placeholder="Add products to your personal notes" placeholderTextColor="#777274" maxLength={400} multiline textAlignVertical="top" style={styles.textInput} />

            <Text style={styles.fieldLabel}>Routine today</Text>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.morningCompleted }} onPress={() => updateDraft({ morningCompleted: !draft.morningCompleted })} style={styles.routineRow}>
              <View style={[styles.checkbox, draft.morningCompleted && styles.checkboxSelected]}>{draft.morningCompleted && <Text style={styles.checkboxMark}>✓</Text>}</View>
              <Text style={styles.routineText}>Morning check-in completed</Text>
            </Pressable>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.eveningCompleted }} onPress={() => updateDraft({ eveningCompleted: !draft.eveningCompleted })} style={styles.routineRow}>
              <View style={[styles.checkbox, draft.eveningCompleted && styles.checkboxSelected]}>{draft.eveningCompleted && <Text style={styles.checkboxMark}>✓</Text>}</View>
              <Text style={styles.routineText}>Evening check-in completed</Text>
            </Pressable>
            <Text style={styles.formDisclosure}>Diary notes are self-reported. SkinSnap does not save photos in diary entries.</Text>
            {editorStatus ? <Text accessibilityLiveRegion="polite" style={styles.status}>{editorStatus}</Text> : null}

            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.saveButton, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color="#181613" /> : <Text style={styles.saveButtonText}>Save check-in</Text>}
            </Pressable>
            {entries.some(item => item.date === draft.date) && <Pressable accessibilityRole="button" disabled={busy} onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>Delete check-in</Text></Pressable>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function CircleGear() {
  return <><Circle cx="12" cy="12" r="3" /><Path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', backgroundColor: '#0A0A0A' },
  content: { flexGrow: 1 },
  header: { paddingTop: 15, paddingBottom: 19 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#D4B896', fontSize: 10, letterSpacing: 1.5, fontFamily: 'InterSemibold' },
  heading: { color: '#FFFFFF', fontSize: 30, lineHeight: 38, marginTop: 4, fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  settingsButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#302E2D' },
  intro: { color: '#9B9696', fontSize: 12, lineHeight: 18, marginTop: 5, fontFamily: 'InterRegular' },
  calendarCard: { padding: 15, borderRadius: 19, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  calendarTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#F5F2EF', fontSize: 16, fontFamily: 'InterSemibold' },
  calendarHint: { color: '#8E8887', fontSize: 9, letterSpacing: 1.1, fontFamily: 'InterMedium' },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  day: { width: '13.1%', minHeight: 67, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 7, gap: 4 },
  daySelected: { backgroundColor: '#E8C9A0' },
  dayName: { color: '#9C9695', fontSize: 9, fontFamily: 'InterMedium' },
  dayNameSelected: { color: '#40372D' },
  dayNumber: { color: '#F5F2EF', fontSize: 15, fontFamily: 'InterSemibold' },
  dayNumberSelected: { color: '#181613' },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dayDotFilled: { backgroundColor: '#D4B896' },
  dayDotChosen: { backgroundColor: '#655541' },
  summaryCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, padding: 15, borderRadius: 18, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  summaryMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#2B2722' },
  summaryMarkText: { color: '#E8C9A0', fontSize: 20 },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: '#D4B896', fontSize: 9, letterSpacing: 1.2, fontFamily: 'InterSemibold' },
  summaryTitle: { color: '#F5F2EF', fontSize: 14, lineHeight: 19, marginTop: 4, fontFamily: 'InterSemibold' },
  summaryDetail: { color: '#8E8887', fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'InterRegular' },
  timelineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 10 },
  entryCount: { color: '#8E8887', fontSize: 10, fontFamily: 'InterRegular' },
  spinner: { marginVertical: 26 },
  entryCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 9, padding: 13, borderRadius: 17, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  entryDate: { width: 47, height: 53, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#29251F' },
  entryDay: { color: '#E8C9A0', fontSize: 20, lineHeight: 24, fontFamily: 'InterSemibold' },
  entryMonth: { color: '#B29E80', fontSize: 8, letterSpacing: 0.8, fontFamily: 'InterSemibold' },
  entryContent: { flex: 1, minWidth: 0 },
  entryTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryFeeling: { color: '#F1EEEC', fontSize: 13, fontFamily: 'InterSemibold' },
  entryChevron: { color: '#8A8585', fontSize: 22 },
  entryNote: { color: '#A8A2A1', fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'InterRegular' },
  entryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  metaPill: { overflow: 'hidden', color: '#CBBB9F', fontSize: 8, borderWidth: 1, borderColor: '#464035', backgroundColor: '#25221D', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontFamily: 'InterMedium' },
  emptyCard: { alignItems: 'center', padding: 23, borderRadius: 18, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  emptyIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#29251F' },
  emptyIconText: { color: '#E8C9A0', fontSize: 22 },
  emptyTitle: { color: '#F3F0EE', fontSize: 15, marginTop: 12, fontFamily: 'InterSemibold' },
  emptyText: { color: '#999393', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7, fontFamily: 'InterRegular' },
  emptyButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#E8C9A0' },
  emptyButtonText: { color: '#181613', fontSize: 11, fontFamily: 'InterSemibold' },
  transparencyCard: { marginTop: 19, padding: 14, borderRadius: 15, backgroundColor: '#151515', borderWidth: 1, borderColor: '#272626' },
  transparencyTitle: { color: '#C4B69F', fontSize: 11, fontFamily: 'InterSemibold' },
  transparencyText: { color: '#898384', fontSize: 10, lineHeight: 15, marginTop: 4, fontFamily: 'InterRegular' },
  status: { color: '#D9BD91', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12, fontFamily: 'InterRegular' },
  retryButton: { alignSelf: 'center', padding: 10 },
  retryText: { color: '#E8C9A0', fontSize: 12, fontFamily: 'InterSemibold' },
  fab: { position: 'absolute', right: 18, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 17, borderRadius: 25, backgroundColor: '#E8C9A0', elevation: 5 },
  fabPlus: { color: '#181613', fontSize: 21, lineHeight: 24, fontFamily: 'InterRegular' },
  fabText: { color: '#181613', fontSize: 11, fontFamily: 'InterSemibold' },
  editorScreen: { flex: 1, alignItems: 'center', backgroundColor: '#0A0A0A' },
  editorHeader: { width: '100%', minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#252425' },
  editorClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  editorCloseText: { color: '#D4B896', fontSize: 28, lineHeight: 30 },
  editorTitle: { color: '#F5F2EF', fontSize: 16, fontFamily: 'InterSemibold' },
  editorContent: { flexGrow: 1 },
  editorDate: { color: '#E8C9A0', fontSize: 12, marginTop: 20, marginBottom: 21, fontFamily: 'InterMedium' },
  fieldLabel: { color: '#F1EEEC', fontSize: 13, marginTop: 17, marginBottom: 10, fontFamily: 'InterSemibold' },
  optional: { color: '#817B7A', fontSize: 8, letterSpacing: 0.8, fontFamily: 'InterMedium' },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: '#373436', backgroundColor: '#19191A' },
  chipSelected: { borderColor: '#D4B896', backgroundColor: '#2B2721' },
  chipText: { color: '#AAA4A4', fontSize: 10, fontFamily: 'InterMedium' },
  chipTextSelected: { color: '#E8C9A0' },
  textInput: { minHeight: 54, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: '#343234', backgroundColor: '#181819', color: '#F5F2EF', fontSize: 12, fontFamily: 'InterRegular' },
  noteInput: { minHeight: 100 },
  routineRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkbox: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: '#666062', backgroundColor: '#19191A' },
  checkboxSelected: { backgroundColor: '#E8C9A0', borderColor: '#E8C9A0' },
  checkboxMark: { color: '#181613', fontSize: 13, fontFamily: 'InterExtraBold' },
  routineText: { color: '#C5BFC0', fontSize: 11, fontFamily: 'InterRegular' },
  formDisclosure: { color: '#827B7C', fontSize: 10, lineHeight: 15, marginTop: 16, fontFamily: 'InterRegular' },
  saveButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 26, backgroundColor: '#E8C9A0' },
  saveButtonText: { color: '#181613', fontSize: 13, fontFamily: 'InterSemibold' },
  disabled: { opacity: 0.65 },
  deleteButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  deleteText: { color: '#C29A87', fontSize: 11, fontFamily: 'InterMedium' },
});
