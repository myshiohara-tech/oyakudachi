// Normalizes English text for forgiving comparison.
// Lowercases, strips punctuation, expands common contractions, collapses whitespace.
const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "what's": 'what is',
  "let's": 'let us',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "won't": 'will not',
  "can't": 'cannot',
  "couldn't": 'could not',
  "shouldn't": 'should not',
  "wouldn't": 'would not',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "we'll": 'we will',
  "they'll": 'they will',
  "i'd": 'i would',
  "you'd": 'you would',
  wanna: 'want to',
  gonna: 'going to',
  gotta: 'got to',
}

export function normalize(text: string): string {
  let s = text.toLowerCase().trim()
  s = s.replace(/[‘’ʼ]/g, "'")
  s = s.replace(/[“”]/g, '"')
  s = s.replace(/[\.,!?;:"“”\(\)\[\]{}\-—–_]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  const words = s.split(' ').map((w) => CONTRACTIONS[w] ?? w)
  return words.join(' ').replace(/\s+/g, ' ').trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const v0 = new Array(b.length + 1)
  const v1 = new Array(b.length + 1)
  for (let i = 0; i <= b.length; i++) v0[i] = i
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]
  }
  return v1[b.length]
}

export type JudgeResult = {
  correct: boolean
  similarity: number
  normalizedUser: string
  normalizedAnswer: string
}

export function judge(userInput: string, answer: string, strict: boolean): JudgeResult {
  const a = normalize(userInput)
  const b = normalize(answer)
  if (!a) return { correct: false, similarity: 0, normalizedUser: a, normalizedAnswer: b }
  if (a === b) return { correct: true, similarity: 1, normalizedUser: a, normalizedAnswer: b }
  if (strict) return { correct: false, similarity: 0, normalizedUser: a, normalizedAnswer: b }
  const dist = levenshtein(a, b)
  const sim = 1 - dist / Math.max(a.length, b.length)
  return {
    correct: sim >= 0.9,
    similarity: sim,
    normalizedUser: a,
    normalizedAnswer: b,
  }
}

// Diff at word-level: returns spans { word, status } for the answer string.
export function wordDiff(userInput: string, answer: string) {
  const userWords = normalize(userInput).split(' ').filter(Boolean)
  const answerWords = answer.split(/\s+/)
  const userSet = new Set(userWords)
  return answerWords.map((w) => {
    const norm = normalize(w)
    return { word: w, hit: norm.length > 0 && userSet.has(norm) }
  })
}
