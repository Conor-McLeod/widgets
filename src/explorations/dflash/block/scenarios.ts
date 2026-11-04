// Hand-made draft outputs for one DFlash cycle. Each draft position gets its own top-4
// distribution, predicted independently in one forward pass. `pair` holds the selector's
// learned "does b follow a?" term for the pairs that matter (everything else scores 0).

export interface Cand {
  tok: string;
  p: number;
}

export interface Scenario {
  key: string;
  name: string;
  /** Text already decoded, ending just before the anchor. */
  context: string;
  /** The last token the target produced: the block is drafted after it. */
  anchor: string;
  /** Per draft position, the drafter's top candidates. */
  cands: Cand[][];
  /** What the target would produce at each position, plus one more (its bonus token). */
  target: string[];
  /** Pair scores keyed `a→b`. */
  pair: Record<string, number>;
  blurb: string;
}

const c = (...xs: [string, number][]): Cand[] => xs.map(([tok, p]) => ({ tok, p }));

export const SCENARIOS: Scenario[] = [
  {
    key: 'modes',
    name: 'Two phrasings',
    context: 'The Eiffel Tower is in Paris',
    anchor: ',',
    cands: [
      c(['which', 0.46], ['a', 0.4], ['the', 0.08], ['and', 0.04]),
      c(['city', 0.44], ['is', 0.4], ['has', 0.08], ['known', 0.05]),
      c(['famous', 0.38], ['known', 0.36], ['that', 0.12], ['of', 0.06]),
      c(['for', 0.8], ['as', 0.1], ['to', 0.05], ['in', 0.03]),
      c(['its', 0.55], ['the', 0.3], ['art', 0.08], ['food', 0.04]),
      c(['food', 0.35], ['art', 0.33], ['cafés', 0.15], ['museums', 0.1]),
    ],
    target: ['which', 'is', 'famous', 'for', 'its', 'art', 'and'],
    pair: {
      'which→is': 2,
      'which→city': -2,
      'a→city': 2,
      'a→is': -1.5,
      'is→famous': 0.5,
      'is→known': 0.4,
      'city→known': 0.6,
    },
    blurb:
      'Position 2 can’t tell whether position 1 said “which” or “a”, so it hedges between “is” and “city”. Each top pick is plausible alone; together they read “which city”.',
  },
  {
    key: 'stutter',
    name: 'Stutter',
    context: 'Before we leave, let me check the',
    anchor: 'weather',
    cands: [
      c(['for', 0.45], ['forecast', 0.44], ['app', 0.05], ['again', 0.03]),
      c(['for', 0.4], ['tomorrow', 0.38], ['today', 0.12], ['the', 0.05]),
      c(['tomorrow', 0.36], ['.', 0.34], ['morning', 0.12], [',', 0.1]),
      c(['It', 0.42], ['I', 0.3], ['The', 0.15], ['If', 0.08]),
      c(['looks', 0.4], ['says', 0.35], ['might', 0.12], ['is', 0.08]),
      c(['like', 0.45], ['sunny', 0.25], ['rainy', 0.15], ['good', 0.1]),
    ],
    target: ['for', 'tomorrow', '.', 'It', 'looks', 'like', 'rain'],
    pair: {
      'for→for': -3,
      'forecast→for': 1,
      'for→tomorrow': 1,
      'tomorrow→tomorrow': -3,
      'tomorrow→.': 1,
      'It→looks': 0.3,
      'looks→like': 1,
      'looks→sunny': 0.5,
    },
    blurb:
      'Position 2 half-expects “forecast” at position 1 and so likes “for”; position 1 also picked “for”. Independent picks repeat a word, and the stutter dies at verification.',
  },
  {
    key: 'easy',
    name: 'Easy code',
    context: 'for i in',
    anchor: 'range',
    cands: [
      c(['(', 0.97], ['(n', 0.01], ['[', 0.01], [':', 0.01]),
      c(['10', 0.62], ['n', 0.2], ['len', 0.12], ['5', 0.04]),
      c([')', 0.9], ['):', 0.05], [',', 0.03], ['(', 0.01]),
      c([':', 0.95], [')', 0.02], [',', 0.02], ['\\n', 0.01]),
      c(['\\n', 0.93], [' pass', 0.04], [' print', 0.02], [':', 0.01]),
      c(['    print', 0.7], ['    if', 0.15], ['    x', 0.08], ['    total', 0.05]),
    ],
    target: ['(', '10', ')', ':', '\\n', '    print', '(i)'],
    pair: { '(→10': 0.3, '10→)': 0.5, '(→len': 0.4, 'len→)': -2 },
    blurb: 'Boilerplate. Every position is confident and the top picks already agree, so the selector has nothing to fix.',
  },
];
