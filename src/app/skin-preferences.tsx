import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { AnalysisPreferencesForm } from '../components/AnalysisPreferencesForm';
import { RetentionPage, Card, Copy, Action, Field, Toggle, Status } from '../components/RetentionUI';
import { loadSkinPreferences, saveSkinPreferences, resetSkinPreferences } from '../services/retentionApi';
import { usePhoto } from '../PhotoContext';
import type { AnalysisPreferences } from '../analysisQuality';
import { backOrReplace } from '../navigation';

export default function SkinPreferencesScreen() {
  const { setAnalysisPreferences } = usePhoto();
  const [value, setValue] = useState<AnalysisPreferences>({});
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('Loading your private preferences...');
  useFocusEffect(useCallback(() => { let active = true; setReady(false); setDirty(false); setValue({}); setConsent(false); setStatus(loadAttempt ? 'Retrying your private preferences...' : 'Loading your private preferences...'); void loadSkinPreferences().then(saved => {
    if (!active) return; const preferences = saved?.preferences ?? {}; setValue(preferences); setConsent(!!saved); setAnalysisPreferences(preferences); setReady(true); setStatus('All questions are optional.');
  }).catch(e => { if (active) setStatus(e instanceof Error ? e.message : 'Your private preferences could not be loaded.'); }); return () => { active = false; }; }, [setAnalysisPreferences, loadAttempt]));
  const change = (next: AnalysisPreferences) => { setValue(next); setDirty(true); };
  const leave = () => dirty ? Alert.alert('Discard preference changes?', 'Your saved preferences will stay as they were.', [{ text: 'Keep editing' }, { text: 'Discard', onPress: () => backOrReplace('/progress') }]) : backOrReplace('/progress');
  const save = async (reset = false) => {
    if (busy) return; setBusy(true);
    try {
      if (reset) { await resetSkinPreferences(); setValue({}); setConsent(false); setAnalysisPreferences({}); }
      else { await saveSkinPreferences({ consent: consent as true, preferences: value }); setAnalysisPreferences(value); }
      setDirty(false); setStatus(reset ? 'Saved preferences removed.' : 'Preferences saved for this secure profile.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not save. Retry when connected.'); } finally { setBusy(false); }
  };
  return <RetentionPage locked={busy} title="My Skin Preferences" onBack={leave}>
    <Copy>Tell us what suits you. These are your own reports, not diagnoses or findings inferred from your photo.</Copy>
    <Status>{status}</Status>
    {!ready && <Action label="Retry loading preferences" secondary disabled={busy} onPress={() => setLoadAttempt(attempt => attempt + 1)} />}
    {!ready && status.includes('Guest access') && <Action label="Sign in or create an account" disabled={busy} onPress={() => router.push('/sign-in')} />}
    {ready && <><AnalysisPreferencesForm extended value={value} onChange={change} />
      <Card><Field label="Country or shopping region · optional" value={value.region ?? ''} maxLength={80} onChangeText={region => change({ ...value, region })} />
        <Field label="Products you use · optional" value={value.products ?? ''} multiline maxLength={400} onChangeText={products => change({ ...value, products })} />
        <Toggle label="Save these preferences to my secure profile and use them for future routine guidance. Relevant answers go to Groq only when I consent to an analysis." checked={consent} onPress={() => { setConsent(!consent); setDirty(true); }} />
        <Copy>Guest profiles belong to this installation. Reinstalling or clearing app data may lose access. Avoid medical details and other personal information.</Copy>
      </Card>
      <Action label={busy ? 'Saving...' : 'Save preferences'} disabled={busy || !consent} onPress={() => void save()} />
      <Action label="Remove saved preferences" secondary disabled={busy} onPress={() => Alert.alert('Remove saved preferences?', 'This clears the saved profile and the preferences used in this session.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void save(true) }])} />
      <Action label="Cancel changes" secondary disabled={busy} onPress={leave} />
    </>}
  </RetentionPage>;
}
