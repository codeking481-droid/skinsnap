import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { theme } from '../theme';

export type IconName = 'scan' | 'leaf' | 'chart' | 'people';

export function FeatureIcon({ name, size = 33 }: { name: IconName; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke={theme.colors.icon} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'scan' && <><Path d="M5 14V9a4 4 0 0 1 4-4h5m12 0h5a4 4 0 0 1 4 4v5M5 26v5a4 4 0 0 0 4 4h5m12 0h5a4 4 0 0 0 4-4v-5" /><Circle cx={20} cy={19} r={7.5} /><Path d="M18 31h4" /></>}
      {name === 'leaf' && <><Path d="M20 34C9 34 3 28 3 18c9 0 15 5 17 16Zm0 0c11 0 17-6 17-16-9 0-15 5-17 16Z" /><Path d="M15 22C11 15 15 9 20 3c6 6 9 12 5 19M20 34V23" /></>}
      {name === 'chart' && <><Rect x={5} y={23} width={7} height={12} rx={1.5} fill={theme.colors.icon} stroke="none" /><Rect x={16} y={14} width={7} height={21} rx={1.5} fill={theme.colors.icon} stroke="none" /><Rect x={27} y={6} width={7} height={29} rx={1.5} fill={theme.colors.icon} stroke="none" /></>}
      {name === 'people' && <><Circle cx={20} cy={12} r={4.5} /><Circle cx={8} cy={17} r={3.2} /><Circle cx={32} cy={17} r={3.2} /><Path d="M10 34v-3c0-5 4-8 10-8s10 3 10 8v3H10ZM10 25c-5-1-8 2-8 6v3h8m20-9c5-1 8 2 8 6v3h-8" /></>}
    </Svg>
  );
}
