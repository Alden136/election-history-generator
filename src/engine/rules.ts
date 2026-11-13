export const RULES = [
  'populist-authoritarian',
  'largest-voter-bloc',
  'republican-loyalty',
  'whig-loyalty',
  'american-party-trigger',
  'failed-president-penalty',
  'liberal-winner-bonus',
  'canada-annexation',
  'presidential-bloc-shift',
  'neutral-party-eligibility',
  'agrarian-liberal',
  'bloc-size-floor',
  'congress-rounding',
  'presidential-tenure',
  'contingent-eligibility',
] as const;

export type Rule = typeof RULES[number];
export type Preset = 'faithful' | 'corrected' | 'custom';

export function rulePreset(rules: readonly Rule[]): Preset {
  if (rules.length === 0) return 'faithful';
  return RULES.every((rule) => rules.includes(rule)) ? 'corrected' : 'custom';
}
