import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { RetentionPage, Card, Copy, Field, Action, Toggle, Status } from '../components/RetentionUI';
import { loadCustomRoutine, saveCustomRoutine, deleteCustomRoutine } from '../services/retentionApi';
import { loadAnalysisHistory, type AnalysisHistoryItem } from '../services/authApi';
import { routineFromAnalysis, type CustomRoutine, type CustomStep } from '../retention';
import { backOrReplace } from '../navigation';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function RoutineEditScreen() {
  const [routine, setRoutine] = useState<CustomRoutine>({ version: 1, steps: [] });
  const [original, setOriginal] = useState<AnalysisHistoryItem | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading your routine...');
  useFocusEffect(useCallback(() => { let active = true; setReady(false); setDirty(false); setRoutine({ version: 1, steps: [] }); setOriginal(null); void (async () => {
    try {
      const [saved, history] = await Promise.all([loadCustomRoutine(), loadAnalysisHistory()]);
      if (!active) return;
      const ai = history.find(item => item.resultId === saved?.sourceResultId) ?? (saved?.sourceResultId ? null : history[0]) ?? null;
      setOriginal(ai); setRoutine(saved ?? (ai ? routineFromAnalysis(ai) : { version: 1, steps: [] })); setReady(true); setStatus('Your edits do not change the original AI report.');
    } catch (e) { if (active) setStatus(e instanceof Error ? e.message : 'Routine unavailable.'); }
  })(); return () => { active = false; }; }, []));
  const update = (next: CustomRoutine) => { setRoutine(next); setDirty(true); };
  const patch = (id: string, value: Partial<CustomStep>) => update({ ...routine, steps: routine.steps.map(step => step.id === id ? { ...step, ...value } : step) });
  const move = (index: number, offset: number) => {
    const steps = [...routine.steps]; const next = index + offset;
    if (next < 0 || next >= steps.length) return;
    [steps[index], steps[next]] = [steps[next], steps[index]]; update({ ...routine, steps });
  };
  const leave = () => dirty ? Alert.alert('Discard routine changes?', 'Unsaved edits will be lost.', [{ text: 'Keep editing' }, { text: 'Discard', onPress: () => backOrReplace('/routine') }]) : backOrReplace('/routine');
  const save = async () => {
    if (busy) return; setBusy(true);
    try { await saveCustomRoutine(routine); setDirty(false); setStatus('Routine saved. Return to Your Routine to use it.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Save failed. Keep your draft and retry.'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return; setBusy(true);
    try { await deleteCustomRoutine(); setRoutine(original ? routineFromAnalysis(original) : { version: 1, steps: [] }); setDirty(false); setStatus('Custom routine removed. Your original AI report is unchanged.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Removal not confirmed. Retry.'); } finally { setBusy(false); }
  };
  return <RetentionPage locked={busy} title="Edit Your Routine" onBack={leave}>
    <Copy>Your routine is customizable. SkinSnap does not verify the safety of products you add. Names and descriptions you enter are your own notes.</Copy>
    <Status>{status}</Status>
    {ready && <>
      {!routine.steps.length && <Card><Copy>Start with a step you already use. No AI request is needed.</Copy></Card>}
      {routine.steps.map((step, index) => <Card key={step.id}>
        <Copy>Step {index + 1} · {step.period}</Copy>
        <Field label="Step or product name" value={step.name} maxLength={80} onChangeText={name => patch(step.id, { name })} />
        <Field label="Your instructions · optional" value={step.description} multiline onChangeText={description => patch(step.id, { description })} />
        <Action secondary label={`Move to ${step.period === 'Morning' ? 'evening' : 'morning'}`} disabled={busy} onPress={() => patch(step.id, { period: step.period === 'Morning' ? 'Evening' : 'Morning' })} />
        <Copy>Scheduled days</Copy>
        {DAYS.map((day, i) => <Toggle key={day} label={day} checked={step.days.includes(i)} onPress={() => patch(step.id, { days: step.days.includes(i) ? step.days.filter(d => d !== i) : [...step.days, i] })} />)}
        <Action secondary label="Move up" disabled={busy || index === 0} onPress={() => move(index, -1)} />
        <Action secondary label="Move down" disabled={busy || index === routine.steps.length - 1} onPress={() => move(index, 1)} />
        <Action secondary label="Remove step" disabled={busy} onPress={() => update({ ...routine, steps: routine.steps.filter(item => item.id !== step.id) })} />
      </Card>)}
      <Action label="Add a step" disabled={busy || routine.steps.length >= 24} onPress={() => update({ ...routine, steps: [...routine.steps, { id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, name: 'My skincare step', description: '', period: 'Morning', days: [0, 1, 2, 3, 4, 5, 6] }] })} />
      <Action label={busy ? 'Saving...' : 'Save routine'} disabled={busy} onPress={() => void save()} />
      {original && <Action secondary label="Restore original AI suggestion" disabled={busy} onPress={() => Alert.alert('Restore original suggestion?', 'This replaces your draft. Save to confirm the replacement.', [{ text: 'Cancel' }, { text: 'Restore', onPress: () => update(routineFromAnalysis(original)) }])} />}
      <Action secondary label="Remove saved custom routine" disabled={busy} onPress={() => Alert.alert('Remove custom routine?', 'The AI report stays in your history.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void remove() }])} />
      <Action label="Cancel changes" secondary disabled={busy} onPress={leave} />
    </>}
  </RetentionPage>;
}
