// Lightweight wrappers around Web Speech API: TTS (synthesis) + STT (recognition).

let voicesCache: SpeechSynthesisVoice[] | null = null

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing.length > 0) {
      voicesCache = existing
      resolve(existing)
      return
    }
    const handler = () => {
      const v = synth.getVoices()
      voicesCache = v
      synth.removeEventListener('voiceschanged', handler)
      resolve(v)
    }
    synth.addEventListener('voiceschanged', handler)
    // Fallback timeout
    setTimeout(() => {
      const v = synth.getVoices()
      if (v.length > 0) {
        voicesCache = v
        resolve(v)
      }
    }, 500)
  })
}

async function pickVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  const voices = voicesCache ?? (await loadVoices())
  if (!voices.length) return null
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase())
  if (exact) return exact
  const prefix = lang.split('-')[0].toLowerCase()
  const pref = voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  return pref ?? null
}

export type SpeakOptions = {
  rate?: number
  lang?: string
  signal?: AbortSignal
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth) return Promise.reject(new Error('Speech synthesis not supported'))
  return new Promise(async (resolve, reject) => {
    try {
      synth.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = opts.lang ?? 'en-US'
      utter.rate = opts.rate ?? 1
      const voice = await pickVoice(utter.lang)
      if (voice) utter.voice = voice
      utter.onend = () => resolve()
      utter.onerror = (e) => {
        // 'interrupted' / 'canceled' are not real errors for our purposes
        if (e.error === 'interrupted' || e.error === 'canceled') resolve()
        else reject(new Error(e.error))
      }
      if (opts.signal) {
        if (opts.signal.aborted) {
          synth.cancel()
          resolve()
          return
        }
        opts.signal.addEventListener('abort', () => {
          synth.cancel()
          resolve()
        })
      }
      synth.speak(utter)
    } catch (e) {
      reject(e)
    }
  })
}

export function cancelSpeech() {
  try {
    window.speechSynthesis.cancel()
  } catch {
    // no-op
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })
}

// ----- Speech recognition (STT) -----
declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export type RecognitionHandle = {
  stop: () => void
}

export function startRecognition(
  onResult: (text: string, isFinal: boolean) => void,
  onError?: (err: string) => void,
  onEnd?: () => void,
  lang = 'en-US'
): RecognitionHandle | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) {
    onError?.('not-supported')
    return null
  }
  const rec = new Ctor()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = false

  rec.onresult = (e: any) => {
    let interim = ''
    let final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    if (final) onResult(final.trim(), true)
    else if (interim) onResult(interim.trim(), false)
  }
  rec.onerror = (e: any) => onError?.(e.error || 'unknown')
  rec.onend = () => onEnd?.()
  try {
    rec.start()
  } catch (e: any) {
    onError?.(e?.message || 'start-failed')
    return null
  }
  return { stop: () => rec.stop() }
}
