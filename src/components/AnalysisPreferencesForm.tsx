import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PROFILE_OPTIONS, type AnalysisPreferences } from '../analysisQuality';

const LABELS: Record<string, string> = {
  fragranceFree: 'Fragrance preference', prefer: 'Fragrance-free preferred', 'no-preference': 'No preference',
  experience: 'Skincare experience', beginner: 'Beginner', experienced: 'Experienced',
  skinType: 'How would you describe your skin?', concern: 'What would you like help with?',
  sensitivity: 'Do products tend to bother your skin?', complexity: 'Routine preference', budget: 'Product budget',
  'not-sure': 'Not sure', dry: 'Dry', oily: 'Oily', combination: 'Combination', balanced: 'Balanced',
  shine: 'Shine', texture: 'Texture / pores', 'uneven-tone': 'Uneven-looking tone',
  'blemish-like-marks': 'Blemish-like marks', 'dry-looking-areas': 'Dry-looking areas', 'general-care': 'General care',
  yes: 'Yes', no: 'No', minimal: 'Essentials only', simple: 'Simple routine',
  'budget-friendly': 'Budget-friendly', flexible: 'Flexible',
};
export function AnalysisPreferencesForm({ value, onChange, extended = false }: { value: AnalysisPreferences; onChange: (value: AnalysisPreferences) => void; extended?: boolean }) {
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Personalize your routine</Text>
    <Text style={styles.hint}>These answers guide your routine, not the photo findings. Every answer is optional. Selected answers go with your analysis and are remembered only if you explicitly save them in My Skin Preferences.</Text>
    {(Object.keys(PROFILE_OPTIONS) as (keyof typeof PROFILE_OPTIONS)[]).filter(key => extended || !['fragranceFree', 'experience'].includes(key)).map(key => <View key={key} style={styles.question}>
      <Text style={styles.label}>{LABELS[key]}</Text>
      <View style={styles.options}>{PROFILE_OPTIONS[key].map(option => <Pressable key={option}
        accessibilityRole="checkbox" accessibilityState={{ checked: value[key] === option }}
        onPress={() => {
          const next = { ...value };
          if (next[key] === option) delete next[key];
          else Object.assign(next, { [key]: option });
          onChange(next);
        }} style={[styles.chip, value[key] === option && styles.selected]}>
        <Text style={styles.text}>{LABELS[option]}</Text>
      </Pressable>)}</View>
    </View>)}
    <Pressable accessibilityRole="button" onPress={() => onChange({})} style={styles.toggle}><Text style={styles.hint}>Clear answers</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { marginVertical: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#49323D', backgroundColor: '#140F15' },
  toggle: { minHeight: 44, justifyContent: 'center' }, title: { color: '#FFD0DF', fontFamily: 'InterSemibold', fontSize: 13 },
  hint: { color: '#CFC7D2', fontSize: 11, lineHeight: 17 }, question: { marginTop: 14 },
  label: { color: '#FFF', fontSize: 12, marginBottom: 7 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#49323D' },
  selected: { backgroundColor: '#5A263D', borderColor: '#FF8EAF' }, text: { color: '#F4EAF1', fontSize: 12 },
});
