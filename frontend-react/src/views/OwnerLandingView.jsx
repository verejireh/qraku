import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Tag, Globe, MapPin, Check, ChevronDown } from 'lucide-react'
import { useSiteLang } from '../hooks/useSiteLang'
import { getOwnerLpCopy, ownerLpContact } from '../i18n/ownerLpTranslations'

// ── 브랜드 토큰 (테마 종속 X, 항상 크림슨) ────────────────────────────────
const CRIMSON = '#C21E2F'
const ACCENT = '#9F1239'
const PERK_BG = '#FDE8E9'
const TEXT = '#334155'
const SUBTEXT = '#94A3B8'
const PAGE_BG = '#F8F6F6'

// ── UTM 캡처: 진입 시 sessionStorage 에 보존, 폼 제출까지 유지 ───────────
const UTM_KEY = 'qraku_owner_utm'
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign']

function captureUtm() {
  const params = new URLSearchParams(window.location.search)
  let stored = {}
  try {
    stored = JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}')
  } catch {
    stored = {}
  }
  let changed = false
  UTM_FIELDS.forEach(f => {
    const v = params.get(f)
    if (v && !stored[f]) {
      stored[f] = v
      changed = true
    }
  })
  if (changed) {
    try { sessionStorage.setItem(UTM_KEY, JSON.stringify(stored)) } catch { /* noop */ }
  }
  return stored
}

function getStoredUtm() {
  try {
    return JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}')
  } catch {
    return {}
  }
}

// 「14日無料」→ /owner/signup 이동 시 UTM 쿼리스트링 이어붙임
function utmQueryString() {
  const utm = getStoredUtm()
  const params = new URLSearchParams()
  UTM_FIELDS.forEach(f => { if (utm[f]) params.set(f, utm[f]) })
  const s = params.toString()
  return s ? `?${s}` : ''
}

// ── SEO / 메타 / JSON-LD 주입 (CSR head injection) ───────────────────────
function injectHead(t) {
  const MARK = 'data-owner-lp'
  // 정리: 이전 주입분 제거
  document.querySelectorAll(`[${MARK}]`).forEach(el => el.remove())

  const created = []
  const upsertMeta = (attr, key, content) => {
    let el = document.querySelector(`meta[${attr}="${key}"]`)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, key)
      el.setAttribute(MARK, '1')
      document.head.appendChild(el)
      created.push(el)
    }
    el.setAttribute('content', content)
  }
  const addLink = (rel, href, hreflang) => {
    const el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute('href', href)
    if (hreflang) el.setAttribute('hreflang', hreflang)
    el.setAttribute(MARK, '1')
    document.head.appendChild(el)
    created.push(el)
  }
  const addJsonLd = (obj) => {
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute(MARK, '1')
    el.textContent = JSON.stringify(obj)
    document.head.appendChild(el)
    created.push(el)
  }

  document.title = t.seo.title
  upsertMeta('name', 'description', t.seo.description)

  const origin = window.location.origin
  addLink('canonical', `${origin}/owner`)
  addLink('alternate', `${origin}/owner`, 'ja')
  addLink('alternate', `${origin}/owner/en`, 'en')
  addLink('alternate', `${origin}/owner/ko`, 'ko')

  upsertMeta('property', 'og:title', t.seo.title)
  upsertMeta('property', 'og:description', t.seo.description)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:url', `${origin}/owner`)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', t.seo.title)
  upsertMeta('name', 'twitter:description', t.seo.description)

  addJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: '飲食店向けQR注文・食品ロス対策サービス',
    provider: { '@type': 'Organization', name: 'QRaku 株式会社' },
    areaServed: { '@type': 'City', name: '御殿場市' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY', description: '御殿場 最初の50店舗 初年度無料' },
  })
  addJsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: t.faq.items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })

  return () => created.forEach(el => el.remove())
}

const LangToggle = ({ lang, setLang }) => (
  <div className="flex items-center gap-0.5 rounded-full p-1 bg-white/15">
    {['ja', 'en'].map(l => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
          lang === l ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'
        }`}
      >
        {l === 'ja' ? 'JP' : 'EN'}
      </button>
    ))}
  </div>
)

const USP_ICONS = { tag: Tag, globe: Globe, 'map-pin': MapPin }

export default function OwnerLandingView({ campaign = null }) {
  const navigate = useNavigate()
  const { lang, setLang } = useSiteLang()
  const t = getOwnerLpCopy(lang)
  const contactRef = useRef(null)

  const [form, setForm] = useState({
    store_name: '',
    contact_name: '',
    contact: '',
    business_type: '',
    message: '',
    preferred_contact: '',
    website: '', // 허니팟
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openFaq, setOpenFaq] = useState(0)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    captureUtm()
  }, [])

  useEffect(() => {
    const cleanup = injectHead(t)
    return cleanup
  }, [t])

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const goSignup = () => {
    navigate(`/owner/signup${utmQueryString()}`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.store_name.trim() || !form.contact_name.trim() || !form.contact.trim()) {
      setError(t.contact.form.errorRequired)
      return
    }
    setError('')
    setLoading(true)
    try {
      const utm = getStoredUtm()
      await axios.post('/api/leads/owner', {
        store_name: form.store_name,
        contact_name: form.contact_name,
        contact: form.contact,
        business_type: form.business_type || null,
        message: form.message || null,
        preferred_contact: form.preferred_contact || null,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        referrer: document.referrer || null,
        landing_path: window.location.pathname,
        website: form.website, // 허니팟
      })
      navigate('/owner/thanks')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : t.contact.form.errorGeneric)
    } finally {
      setLoading(false)
    }
  }

  const ctaStyle = { background: CRIMSON }
  const hoverIn = e => (e.currentTarget.style.background = ACCENT)
  const hoverOut = e => (e.currentTarget.style.background = CRIMSON)

  return (
    <div style={{ background: PAGE_BG, color: TEXT, fontFamily: "'Noto Sans JP', sans-serif" }} className="min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
        .owner-lp-section { max-width: 960px; margin: 0 auto; padding: 56px 20px; }
        @media (max-width: 640px) { .owner-lp-section { padding: 40px 16px; } }
      `}</style>

      {/* 5-0. Sticky 헤더 */}
      <header className="sticky top-0 z-50 shadow-sm" style={{ background: CRIMSON }}>
        <div className="max-w-[960px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-white font-black text-lg tracking-tight">{t.brand}</span>
          <div className="flex items-center gap-3">
            <LangToggle lang={lang} setLang={setLang} />
            <button
              onClick={scrollToContact}
              className="px-4 py-2 rounded-full bg-white font-bold text-sm transition-transform hover:scale-105"
              style={{ color: CRIMSON }}
            >
              {t.navCta}
            </button>
          </div>
        </div>
      </header>

      {/* 5-1. Hero */}
      <section className="owner-lp-section text-center">
        {campaign === 'gotemba50' && (
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: PERK_BG, color: CRIMSON, border: `1px solid ${CRIMSON}` }}>
            {t.hero.campaignBadge}
          </span>
        )}
        <p className="font-bold text-lg mb-3" style={{ color: CRIMSON }}>{t.brand}</p>
        <h1 className="text-3xl sm:text-5xl font-black leading-tight mb-5" style={{ color: TEXT }}>
          {t.hero.h1}
        </h1>
        <p className="text-base sm:text-lg leading-relaxed mb-1">{t.hero.sub1}</p>
        <p className="text-base sm:text-lg leading-relaxed mb-8">{t.hero.sub2}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={scrollToContact}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-white shadow-lg transition-colors"
            style={ctaStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
          >
            {t.hero.ctaPrimary}
          </button>
          <button
            onClick={goSignup}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold transition-colors bg-transparent"
            style={{ color: CRIMSON, border: `2px solid ${CRIMSON}` }}
          >
            {t.hero.ctaSecondary}
          </button>
        </div>
        <p className="mt-6 text-sm font-bold" style={{ color: CRIMSON }}>{t.hero.note}</p>
      </section>

      {/* 5-2. Pain */}
      <section className="owner-lp-section">
        <h2 className="text-2xl sm:text-3xl font-black text-center mb-8" style={{ color: TEXT }}>{t.pain.title}</h2>
        <ul className="max-w-2xl mx-auto space-y-4">
          {t.pain.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 bg-white rounded-2xl p-5 shadow-sm">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5" style={{ background: PERK_BG }}>
                <Check className="w-4 h-4" style={{ color: CRIMSON }} />
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-center mt-8 text-lg font-bold" style={{ color: TEXT }}>{t.pain.close}</p>
      </section>

      {/* 5-3. USP 3블록 */}
      <section className="owner-lp-section">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.usp.map((u, i) => {
            const Icon = USP_ICONS[u.icon] || Tag
            return (
              <div key={i} className="bg-white rounded-2xl p-7 shadow-sm">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: PERK_BG }}>
                  <Icon className="w-6 h-6" style={{ color: CRIMSON }} />
                </div>
                <h3 className="text-lg font-black mb-2" style={{ color: TEXT }}>{u.title}</h3>
                <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>{u.body}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* 5-4. 料金 / 비교표 */}
      <section className="owner-lp-section">
        <h2 className="text-2xl sm:text-3xl font-black text-center mb-8" style={{ color: TEXT }}>{t.price.title}</h2>
        <div className="max-w-xl mx-auto bg-white rounded-2xl p-7 shadow-sm space-y-3 mb-6">
          {t.price.rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span style={{ color: SUBTEXT }}>{r.label}</span>
              <span className="font-bold" style={{ color: TEXT }}>{r.value}</span>
            </div>
          ))}
          <div className="pt-3 mt-1 rounded-xl p-4 font-bold text-center" style={{ background: PERK_BG, color: CRIMSON }}>
            {t.price.special}
          </div>
        </div>

        {/* 비교표 (익명 A社/B社) — 모바일 가로 스크롤 */}
        <div className="max-w-2xl mx-auto overflow-x-auto">
          <table className="w-full bg-white rounded-2xl shadow-sm overflow-hidden text-center text-sm">
            <thead>
              <tr style={{ background: '#FBE9EB' }}>
                {t.price.table.head.map((h, i) => (
                  <th key={i} className={`py-3 px-3 font-black ${i === 1 ? '' : ''}`} style={{ color: i === 1 ? CRIMSON : TEXT }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.price.table.rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-3 px-3 text-left font-bold" style={{ color: TEXT }}>{row.label}</td>
                  <td className="py-3 px-3 font-black" style={{ color: CRIMSON }}>{row.qraku}</td>
                  <td className="py-3 px-3" style={{ color: SUBTEXT }} aria-label={row.a === '―' ? 'なし' : undefined}>{row.a}</td>
                  <td className="py-3 px-3" style={{ color: SUBTEXT }} aria-label={row.b === '―' ? 'なし' : undefined}>{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs mt-2 px-1" style={{ color: SUBTEXT }}>{t.price.table.note}</p>
        </div>
      </section>

      {/* 5-5. 特典 배너 */}
      <section className="owner-lp-section">
        <div className="max-w-2xl mx-auto rounded-2xl p-7 text-center" style={{ background: PERK_BG, border: `1px solid ${CRIMSON}` }}>
          <p className="font-black text-lg mb-4" style={{ color: CRIMSON }}>{t.perk.badge}</p>
          <div className="space-y-2">
            {t.perk.lines.map((line, i) => (
              <p key={i} className="leading-relaxed font-medium" style={{ color: TEXT }}>{line}</p>
            ))}
          </div>
        </div>
      </section>

      {/* 5-6. 補助金 */}
      <section className="owner-lp-section">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-7 shadow-sm">
          <h2 className="text-xl sm:text-2xl font-black mb-5" style={{ color: TEXT }}>{t.subsidy.title}</h2>
          <ul className="space-y-3 mb-5">
            {t.subsidy.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full mt-2.5" style={{ background: CRIMSON }} />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-bold" style={{ color: TEXT }}>{t.subsidy.close}</p>
        </div>
      </section>

      {/* 5-7. 導入の流れ */}
      <section className="owner-lp-section">
        <h2 className="text-2xl sm:text-3xl font-black text-center mb-8" style={{ color: TEXT }}>{t.steps.title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto">
          {t.steps.items.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="text-3xl font-black mb-3" style={{ color: CRIMSON }}>{s.no}</div>
              <h3 className="font-black mb-2" style={{ color: TEXT }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5-8. 想定効果 */}
      <section className="owner-lp-section">
        <div className="max-w-2xl mx-auto rounded-2xl p-7" style={{ background: PERK_BG, border: `1px solid ${CRIMSON}` }}>
          <h2 className="text-xl font-black mb-4" style={{ color: CRIMSON }}>{t.effect.title}</h2>
          <p className="font-bold mb-2" style={{ color: TEXT }}>{t.effect.modelLabel}</p>
          <div className="space-y-1 mb-4">
            {t.effect.lines.map((line, i) => (
              <p key={i} className="leading-relaxed" style={{ color: TEXT }}>{line}</p>
            ))}
          </div>
          <p className="text-xs" style={{ color: SUBTEXT }}>{t.effect.disclaimer}</p>
        </div>
      </section>

      {/* 5-9. FAQ */}
      <section className="owner-lp-section">
        <h2 className="text-2xl sm:text-3xl font-black text-center mb-8" style={{ color: TEXT }}>{t.faq.title}</h2>
        <div className="max-w-2xl mx-auto space-y-3">
          {t.faq.items.map((item, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                className="w-full flex items-center justify-between gap-3 p-5 text-left font-bold"
                style={{ color: TEXT }}
                aria-expanded={openFaq === i}
              >
                <span>Q. {item.q}</span>
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} style={{ color: CRIMSON }} />
              </button>
              {openFaq === i && (
                <p className="px-5 pb-5 leading-relaxed" style={{ color: SUBTEXT }}>A. {item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5-10. 최종 CTA + 상담 폼 */}
      <section ref={contactRef} id="contact" className="owner-lp-section">
        <div className="max-w-xl mx-auto text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black mb-3" style={{ color: TEXT }}>{t.contact.title}</h2>
          <p style={{ color: SUBTEXT }}>{t.contact.sub}</p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-xl mx-auto bg-white rounded-2xl p-7 shadow-sm space-y-5">
          {error && (
            <div className="p-4 rounded-xl text-sm font-bold" style={{ background: PERK_BG, color: CRIMSON }}>
              ⚠️ {error}
            </div>
          )}

          {/* 허니팟 (화면 밖) */}
          <input
            type="text" tabIndex={-1} autoComplete="off"
            value={form.website} onChange={e => set('website', e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
            aria-hidden="true"
          />

          <Field label={t.contact.form.storeName} required req={t.contact.form.required}>
            <input className="owner-input" value={form.store_name} onChange={e => set('store_name', e.target.value)} />
          </Field>
          <Field label={t.contact.form.contactName} required req={t.contact.form.required}>
            <input className="owner-input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </Field>
          <Field label={t.contact.form.contact} required req={t.contact.form.required}>
            <input className="owner-input" value={form.contact} onChange={e => set('contact', e.target.value)} />
          </Field>
          <Field label={t.contact.form.businessType}>
            <div className="relative">
              <select
                className="owner-input appearance-none pr-10"
                value={form.business_type}
                onChange={e => set('business_type', e.target.value)}
              >
                <option value="">{t.contact.form.businessTypePlaceholder}</option>
                {t.contact.form.businessTypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SUBTEXT }} />
            </div>
          </Field>
          <Field label={t.contact.form.message}>
            <textarea className="owner-input min-h-[100px] resize-y" value={form.message} onChange={e => set('message', e.target.value)} />
          </Field>
          <Field label={t.contact.form.preferredContact}>
            <div className="flex flex-wrap gap-2">
              {t.contact.form.preferredOptions.map(o => (
                <label key={o} className="flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer text-sm"
                  style={form.preferred_contact === o
                    ? { borderColor: CRIMSON, background: PERK_BG, color: CRIMSON, fontWeight: 700 }
                    : { borderColor: '#e2e8f0', color: SUBTEXT }}>
                  <input type="radio" name="preferred_contact" value={o} checked={form.preferred_contact === o}
                    onChange={e => set('preferred_contact', e.target.value)} className="accent-[#C21E2F]" />
                  {o}
                </label>
              ))}
            </div>
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-white shadow-lg transition-colors disabled:opacity-60"
            style={ctaStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
          >
            {loading ? t.contact.form.submitting : t.contact.form.submit}
          </button>
        </form>

        {/* 연락처 */}
        <div className="max-w-xl mx-auto text-center mt-8 space-y-1 text-sm" style={{ color: SUBTEXT }}>
          {ownerLpContact.phone && <p>📞 {ownerLpContact.phone}</p>}
          <p>✉️ <a href={`mailto:${ownerLpContact.email}`} className="underline" style={{ color: CRIMSON }}>{ownerLpContact.email}</a></p>
          <p>🌐 {ownerLpContact.site}</p>
          <p className="font-bold pt-2" style={{ color: TEXT }}>{ownerLpContact.company}</p>
        </div>
      </section>

      <style>{`
        .owner-input {
          width: 100%;
          padding: 13px 15px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          color: ${TEXT};
          font-size: 15px;
          outline: none;
          transition: all 0.2s;
        }
        .owner-input:focus { border-color: ${CRIMSON}; box-shadow: 0 0 0 3px rgba(194,30,47,0.12); }
        .owner-input::placeholder { color: ${SUBTEXT}; }
      `}</style>
    </div>
  )
}

function Field({ label, required, req, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: SUBTEXT }}>
        {label}
        {required && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: PERK_BG, color: CRIMSON }}>{req}</span>}
      </label>
      {children}
    </div>
  )
}
