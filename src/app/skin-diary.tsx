import { todayRoutineCompletion } from '../services/routineCompletion';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { RetentionPage, Card, Copy, Action, Field, Toggle, Status } from '../components/RetentionUI';
import { FEELINGS, COSMETIC_CONCERNS, diaryWeekSummary, isLocalDate, type DiaryEntry } from '../retention';
import { loadDiary, saveDiary, deleteDiary, loadDiaryEntry } from '../services/retentionApi';
import { localDayKey } from '../routineProgressState';
import { backOrReplace } from '../navigation';

function blank(date = localDayKey()): DiaryEntry {
  return { date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', note: '', products: '', morningCompleted: false, eveningCompleted: false, concerns: [] };
}
export default function SkinDiaryScreen() {
  const [historyLimit, setHistoryLimit] = useState(14);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [entry, setEntry] = useState<DiaryEntry>(() => blank());
  const [checkmarks, setCheckmarks] = useState<{ morning: boolean; evening: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading your private diary...');
  const [date, setDate] = useState(localDayKey());
  useFocusEffect(useCallback(() => { let active = true; setReady(false); setEntries([]); setDirty(false); setCheckmarks(null); setStatus(loadAttempt ? 'Retrying your private diary...' : 'Loading your private diary...'); void todayRoutineCompletion().then(value => { if (active) setCheckmarks(value); }).catch(() => { if (active) setCheckmarks(null); }); void loadDiary().then(({ entries: savedEntries, recovered, skipped }) => {
    if (!active) return; setEntries(savedEntries); const today = localDayKey(); setDate(today); setEntry(savedEntries.find(e => e.date === today) ?? blank(today)); setDirty(false); setReady(true);
    setStatus(skipped
      ? `${skipped} saved ${skipped === 1 ? 'entry was' : 'entries were'} skipped because the data could not be read safely. ${recovered ? `${recovered} older ${recovered === 1 ? 'entry was' : 'entries were'} restored with missing optional fields left blank.` : ''}`
      : recovered
        ? `${recovered} older ${recovered === 1 ? 'entry was' : 'entries were'} restored with missing optional fields left blank.`
        : 'Your own check-in. No AI analysis or quota is used.');
  }).catch(e => { if (active) setStatus(e instanceof Error ? e.message : 'Your private diary could not be loaded.'); }); return () => { active = false; }; }, [loadAttempt]));
  const change = (value: Partial<DiaryEntry>) => { setEntry(current => ({ ...current, ...value })); setDirty(true); };
  const select = (next: string) => {
    if (!isLocalDate(next) || next > localDayKey()) { setStatus('Choose today or an earlier date in YYYY-MM-DD format.'); return; }
    const open = async () => {
      if (busy) return; setBusy(true);
      try {
        const saved = entries.find(e => e.date === next) ?? await loadDiaryEntry(next);
        if (saved) setEntries(items => [...items.filter(e => e.date !== saved.date), saved].sort((a, b) => b.date.localeCompare(a.date)));
        setEntry(saved ?? blank(next)); setDate(next); setDirty(false); setStatus('Check-in for ' + next);
      }
      catch (e) { setStatus(e instanceof Error ? e.message : 'Could not open that date. Your draft is unchanged.'); }
      finally { setBusy(false); }
    };
    if (dirty) Alert.alert('Discard diary changes?', 'Your unsaved entry will be lost.', [{ text: 'Keep editing' }, { text: 'Discard', onPress: () => void open() }]); else void open();
  };
  const save = async (remove = false) => {
    if (busy) return; setBusy(true);
    try {
      if (remove) { await deleteDiary(entry.date); setEntries(items => items.filter(e => e.date !== entry.date)); setEntry(blank(entry.date)); }
      else { await saveDiary(entry); setEntries(items => [...items.filter(e => e.date !== entry.date), entry].sort((a, b) => b.date.localeCompare(a.date))); }
      setDirty(false); setStatus(remove ? 'Diary entry deleted.' : 'Diary entry saved.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Change not confirmed. Retry when connected.'); } finally { setBusy(false); }
  };
  const summary = diaryWeekSummary(entries, localDayKey());
  const leave = () => dirty ? Alert.alert('Discard diary changes?', 'Unsaved changes will be lost.', [{ text: 'Keep editing' }, { text: 'Discard', onPress: () => backOrReplace('/progress') }]) : backOrReplace('/progress');
  return <RetentionPage locked={busy} title="My Skin Diary" onBack={leave}>
    <Copy>A private record of how your skin feels. These are self-reports, not diagnoses or measurements of improvement. Save only what you are comfortable keeping in your secure profile.</Copy>
    <Status>{status}</Status>
    {!ready && <Action label="Retry loading diary" secondary disabled={busy} onPress={() => setLoadAttempt(attempt => attempt + 1)} />}
    {ready && <>
      <Card><Copy>{summary.entries} check-ins this week · Morning completed {summary.morning} times · Evening completed {summary.evening} times.</Copy><Copy>Completion is what you record here. Routine checkmarks are available in Your Routine.</Copy></Card>
      <Field label="Browse date · YYYY-MM-DD" value={date} maxLength={10} onChangeText={setDate} />
      <Action label="Open date" secondary disabled={busy} onPress={() => select(date)} />
      <Action label="Today's check-in" secondary disabled={busy} onPress={() => select(localDayKey())} />
      {entry.date === localDayKey() && checkmarks && <Card><Copy>Current routine checkmarks: Morning {checkmarks.morning ? 'complete' : 'not complete'} / Evening {checkmarks.evening ? 'complete' : 'not complete'}</Copy><Action secondary label="Use today's checkmarks in this entry" disabled={busy} onPress={() => change({ morningCompleted: checkmarks.morning, eveningCompleted: checkmarks.evening })} /></Card>}
      <Card><Copy>Editing {entry.date} · {entry.timeZone}</Copy><Copy>How does your skin feel? Optional; tap again to clear.</Copy>
        {FEELINGS.map(feeling => <Toggle key={feeling} label={feeling} checked={entry.feeling === feeling} onPress={() => change({ feeling: entry.feeling === feeling ? undefined : feeling })} />)}
        <Field label="A short note · optional" value={entry.note} maxLength={600} multiline onChangeText={note => change({ note })} />
        <Toggle label="Morning routine completed" checked={entry.morningCompleted} onPress={() => change({ morningCompleted: !entry.morningCompleted })} />
        <Toggle label="Evening routine completed" checked={entry.eveningCompleted} onPress={() => change({ eveningCompleted: !entry.eveningCompleted })} />
        <Copy>Cosmetic concerns · optional</Copy>
        {COSMETIC_CONCERNS.map(concern => <Toggle key={concern} label={concern} checked={entry.concerns.includes(concern)} onPress={() => change({ concerns: entry.concerns.includes(concern) ? entry.concerns.filter(c => c !== concern) : [...entry.concerns, concern] })} />)}
        <Field label="Products used · optional, your own notes" value={entry.products} multiline onChangeText={products => change({ products })} />
      </Card>
      <Action label={busy ? 'Saving...' : 'Save check-in'} disabled={busy} onPress={() => void save()} />
      {entries.some(e => e.date === entry.date) && <Action secondary label="Delete this entry" disabled={busy} onPress={() => Alert.alert('Delete diary entry?', 'This removes only the selected date.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void save(true) }])} />}
      <Action label="Discard changes" secondary disabled={busy} onPress={() => select(entry.date)} />
      <Card><Copy>Recent history - browse any earlier date above</Copy>
        {!entries.length && <Copy>Your saved check-ins will appear here.</Copy>}
        {entries.slice(0, historyLimit).map(item => <Action key={item.date} secondary disabled={busy} label={`${item.date} · ${item.feeling ?? 'Check-in'}${item.morningCompleted ? ' · AM ✓' : ''}${item.eveningCompleted ? ' · PM ✓' : ''}`} onPress={() => select(item.date)} />)}
        {entries.length > historyLimit && <Action secondary label="Show older check-ins" disabled={busy} onPress={() => setHistoryLimit(limit => limit + 14)} />}
      </Card>
    </>}
  </RetentionPage>;
}
