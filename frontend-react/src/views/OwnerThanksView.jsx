import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { useSiteLang } from '../hooks/useSiteLang'
import { getOwnerLpCopy } from '../i18n/ownerLpTranslations'

const CRIMSON = '#C21E2F'
const ACCENT = '#9F1239'

export default function OwnerThanksView() {
  const navigate = useNavigate()
  const { lang } = useSiteLang()
  const t = getOwnerLpCopy(lang)

  useEffect(() => {
    document.title = t.seo.title
  }, [t])

  // 진입 UTM 보존하여 /owner/signup 으로 이어붙임
  const goSignup = () => {
    const qs = window.location.search || ''
    navigate(`/owner/signup${qs}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F8F6F6', fontFamily: "'Noto Sans JP', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');`}</style>
      <div className="w-full max-w-md text-center space-y-8">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: '#FDE8E9', border: `1px solid ${CRIMSON}` }}>
          <CheckCircle className="w-10 h-10" style={{ color: CRIMSON }} />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-black" style={{ color: '#334155' }}>{t.thanks.title}</h1>
          <p className="leading-relaxed whitespace-pre-line" style={{ color: '#94A3B8' }}>{t.thanks.desc}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={goSignup}
            className="w-full py-4 rounded-2xl font-black text-white transition-colors"
            style={{ background: CRIMSON }}
            onMouseEnter={e => (e.currentTarget.style.background = ACCENT)}
            onMouseLeave={e => (e.currentTarget.style.background = CRIMSON)}
          >
            {t.thanks.tryFree}
          </button>
          <button onClick={() => navigate('/')} className="text-sm transition-colors" style={{ color: '#94A3B8' }}>
            {t.thanks.backHome}
          </button>
        </div>
      </div>
    </div>
  )
}
