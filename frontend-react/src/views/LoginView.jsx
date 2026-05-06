import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSiteLang } from '../hooks/useSiteLang'
import { loginT } from '../i18n/siteTranslations'

const LangToggle = ({ lang, setLang }) => (
  <div className="flex items-center gap-0.5 bg-white/10 rounded-full p-1">
    {['ja', 'en'].map(l => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
          lang === l ? 'bg-white text-slate-900' : 'text-white/50 hover:text-white'
        }`}
      >
        {l === 'ja' ? 'JP' : 'EN'}
      </button>
    ))}
  </div>
)

export default function LoginView() {
  const { lang, setLang } = useSiteLang()
  const t = loginT[lang]

  return (
    <div className="relative min-h-screen bg-[#0f0f10] flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square bg-rose-500/10 blur-[100px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] aspect-square bg-rose-500/5 blur-[100px] rounded-full" />

      {/* Lang toggle — top right */}
      <div className="absolute top-5 right-5 z-10">
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-10">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 bg-rose-500 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-rose-500/20 rotate-12">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-white tracking-tight">{t.title}</h1>
            <p className="text-slate-500 text-xs">{t.subtitle}</p>
          </div>
        </header>

        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white font-bold text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t.google}
          </a>
          <a
            href="/api/auth/line"
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white font-bold text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#06C755">
              <path d="M12 2C6.477 2 2 6.03 2 11.01c0 4.49 3.663 8.25 8.614 8.919.334.072.79.22.905.506.104.261.068.669.033.933l-.147.882c-.045.26-.206 1.016.89.554 1.096-.462 5.913-3.483 8.07-5.963C21.622 14.985 22 13.054 22 11.01 22 6.03 17.523 2 12 2z"/>
            </svg>
            {t.line}
          </a>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t.divider}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <Link
          to="/owner/signup"
          className="block text-center w-full py-3.5 rounded-2xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-colors"
        >
          {t.signup}
        </Link>

        <footer className="text-center">
          <Link to="/" className="text-[10px] text-slate-600 uppercase font-bold tracking-widest hover:text-slate-400 transition-colors">
            {t.back}
          </Link>
        </footer>
      </div>
    </div>
  )
}
