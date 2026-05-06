import { useState } from 'react'

const STORAGE_KEY = 'qraku_site_lang'

export function useSiteLang() {
  const [lang, setLangState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ja') return stored
    const browserLang = navigator.language?.toLowerCase() || ''
    return browserLang.startsWith('en') ? 'en' : 'ja'
  })

  const setLang = (l) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }

  return { lang, setLang }
}
