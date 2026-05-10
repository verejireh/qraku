import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSiteLang } from '../hooks/useSiteLang';
import { siteT } from '../i18n/siteTranslations';

const LangToggle = ({ lang, setLang, dark = false }) => (
  <div className={`flex items-center gap-0.5 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-black/5'}`}>
    {['ja', 'en'].map(l => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
          lang === l
            ? dark ? 'bg-white text-slate-900' : 'bg-white shadow text-on-surface'
            : dark ? 'text-white/60 hover:text-white' : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        {l === 'ja' ? 'JP' : 'EN'}
      </button>
    ))}
  </div>
);

const LandingView = () => {
  const { lang, setLang } = useSiteLang();
  const t = siteT[lang];

  useEffect(() => {
    document.title = lang === 'en'
      ? 'QRaku — Easy QR ordering for restaurants'
      : 'QRaku — QRコードでかんたん注文';
  }, [lang]);

  return (
    <div className="font-body bg-surface text-on-surface min-h-screen overflow-x-hidden relative">
      <style dangerouslySetInnerHTML={{__html: `
        .hero-bg {
          background:
            radial-gradient(ellipse 80% 60% at 70% 40%, rgba(194,30,47,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 60% 50% at 10% 80%, rgba(194,30,47,0.04) 0%, transparent 60%),
            var(--color-surface, #f8f6f6);
        }
        .grain::before {
          content: "";
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
        }
        .glass {
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.5);
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        .float-anim { animation: float 4s ease-in-out infinite; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-in-1 { animation: fadeInUp 0.7s ease both 0.1s; }
        .fade-in-2 { animation: fadeInUp 0.7s ease both 0.25s; }
        .fade-in-3 { animation: fadeInUp 0.7s ease both 0.4s; }
        .fade-in-4 { animation: fadeInUp 0.7s ease both 0.55s; }
        .step-line::after {
          content: "";
          position: absolute;
          top: 28px;
          left: calc(50% + 28px);
          width: calc(100% - 56px);
          height: 2px;
          background: linear-gradient(90deg, #c21e2f 0%, rgba(194,30,47,0.25) 100%);
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c4a4a4; border-radius: 9999px; }
      `}} />

      <div className="grain fixed inset-0 pointer-events-none z-0"></div>

      {/* HEADER / NAV */}
      <header className="sticky top-0 z-50 glass border-b border-outline-variant/30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between relative z-10">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#c21e2f"/>
              <rect x="6" y="6" width="8" height="8" rx="1.5" fill="white"/>
              <rect x="8" y="8" width="4" height="4" rx="0.5" fill="#c21e2f"/>
              <rect x="18" y="6" width="8" height="8" rx="1.5" fill="white"/>
              <rect x="20" y="8" width="4" height="4" rx="0.5" fill="#c21e2f"/>
              <rect x="6" y="18" width="8" height="8" rx="1.5" fill="white"/>
              <rect x="8" y="20" width="4" height="4" rx="0.5" fill="#c21e2f"/>
              <rect x="18" y="18" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="23" y="18" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="18" y="23" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="23" y="23" width="3" height="3" rx="0.5" fill="white"/>
            </svg>
            <span className="text-xl font-headline font-bold tracking-tight text-on-surface">QRaku</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-on-surface-variant">
            <a href="#features" className="hover:text-primary transition-colors">{t.nav.features}</a>
            <a href="#how" className="hover:text-primary transition-colors">{t.nav.howItWorks}</a>
            <a href="#for-owners" className="hover:text-primary transition-colors">{t.nav.forOwners}</a>
            <a href="#pricing" className="hover:text-primary transition-colors">{t.nav.pricing}</a>
          </nav>

          <div className="flex items-center gap-3">
            <LangToggle lang={lang} setLang={setLang} />
            <Link to="/owner/login" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">{t.nav.login}</Link>
            <Link to="/owner/signup" className="bg-primary hover:opacity-90 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all shadow-sm shadow-primary/20 hover:shadow-md">
              {t.nav.startFree}
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero-bg relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div className="relative z-10">
            <div className="fade-in-1 inline-flex items-center gap-2 bg-primary-fixed border border-primary/20 text-on-primary-fixed-variant text-xs font-bold px-3 py-1.5 rounded-full mb-6">
              <span className="material-symbols-outlined text-sm" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>bolt</span>
              {t.hero.badge}
            </div>
            {lang === 'ja' ? (
              <h1 className="fade-in-2 text-4xl md:text-5xl font-headline font-black leading-tight text-on-surface mb-5">
                注文がもっと<br/>
                <span className="text-primary">スムーズ</span>に、<br/>
                もっと<span className="text-primary">楽しく</span>。
              </h1>
            ) : (
              <h1 className="fade-in-2 text-4xl md:text-5xl font-headline font-black leading-tight text-on-surface mb-5">
                Make Ordering<br/>
                <span className="text-primary">Smoother</span> and<br/>
                More <span className="text-primary">Enjoyable</span>.
              </h1>
            )}
            <p className="fade-in-3 text-base text-on-surface-variant leading-relaxed mb-8 max-w-md">
              {t.hero.desc}
            </p>
            <div className="fade-in-4 flex flex-wrap gap-3">
              <Link to="/owner/signup" className="bg-primary hover:opacity-90 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-primary/25 hover:shadow-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{fontSize:'18px'}}>store</span>
                {t.hero.cta}
              </Link>
              <Link to="/demo" className="bg-white hover:bg-surface-container-low text-on-surface font-medium px-7 py-3.5 rounded-full border border-outline-variant transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{fontSize:'18px'}}>play_circle</span>
                {t.hero.demo}
              </Link>
            </div>

            <div className="mt-12 flex gap-8">
              <div>
                <div className="text-2xl font-black text-on-surface">2,400<span className="text-primary">+</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">{t.hero.stats.stores}</div>
              </div>
              <div className="w-px bg-outline-variant/30"></div>
              <div>
                <div className="text-2xl font-black text-on-surface">98<span className="text-primary">%</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">{t.hero.stats.satisfaction}</div>
              </div>
              <div className="w-px bg-outline-variant/30"></div>
              <div>
                <div className="text-2xl font-black text-on-surface">3<span className="text-sm font-medium">{lang === 'ja' ? '分' : 'min'}</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">{t.hero.stats.setup}</div>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center items-center">
            <div className="float-anim relative z-10 w-full max-w-md">
              <img src="/images/hero_illustration.png" alt="QRaku Service Illustration" className="rounded-[2rem] w-full shadow-2xl" />
            </div>
            <div className="absolute top-1/4 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-on-surface-variant opacity-40">
          <span className="text-xs">{t.hero.scroll}</span>
          <span className="material-symbols-outlined text-sm animate-bounce">keyboard_arrow_down</span>
        </div>
      </section>

      {/* LOGOS */}
      <section className="border-y border-outline-variant/30 bg-white/60 py-8 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-xs text-on-surface-variant font-medium mb-6 tracking-widest uppercase">{t.logos}</p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-50 grayscale">
            <span className="text-lg font-black tracking-tight text-on-surface">居酒屋 花まる</span>
            <span className="w-px h-5 bg-outline-variant/50"></span>
            <span className="text-lg font-black tracking-tight text-on-surface">ラーメン 大将</span>
            <span className="w-px h-5 bg-outline-variant/50"></span>
            <span className="text-lg font-black tracking-tight text-on-surface">寿司割烹 松</span>
            <span className="w-px h-5 bg-outline-variant/50"></span>
            <span className="text-lg font-black tracking-tight text-on-surface">カフェ サクラ</span>
            <span className="w-px h-5 bg-outline-variant/50"></span>
            <span className="text-lg font-black tracking-tight text-on-surface">焼肉 牛一</span>
          </div>
        </div>
      </section>

      {/* TAKEOUT — 신규 섹션: 이미지(왼) + 카피(오른) */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-amber-50 via-rose-50/40 to-amber-50 border-y border-outline-variant/30 relative z-10 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">

          {/* LEFT: Illustration */}
          <div className="relative order-2 md:order-1">
            <div className="float-anim relative z-10">
              <img
                src="/images/takeout_illustration.png"
                alt="QRaku テイクアウト先決済"
                className="rounded-[2rem] w-full shadow-2xl shadow-amber-900/20"
                onError={e => { e.target.style.display = 'none' }}
              />
            </div>
            <div className="absolute -top-6 -left-6 w-48 h-48 bg-rose-300/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-6 -right-6 w-56 h-56 bg-amber-300/30 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* RIGHT: Hooking copy */}
          <div className="order-1 md:order-2 space-y-6">
            <span className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[10px] sm:text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
              <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>shopping_bag</span>
              {t.takeout?.badge || 'NEW · かんたんテイクアウト先決済'}
            </span>
            <h2 className="text-3xl md:text-5xl font-headline font-black leading-tight text-on-surface whitespace-pre-line">
              {t.takeout?.heading || '並ばない、待たせない。\nテイクアウトはもう、\n「届いた頃に来店」へ。'}
            </h2>
            <p className="text-base md:text-lg text-on-surface-variant leading-relaxed">
              {t.takeout?.desc || 'お客様はスマホで事前注文・先決済。準備ができた時刻に来店して、受け取るだけ。'}
            </p>

            {/* Benefit bullets */}
            <ul className="space-y-3 pt-2">
              {(t.takeout?.bullets || []).map((b, i) => (
                <li key={i} className="flex items-start gap-3 bg-white/80 backdrop-blur-sm border border-white rounded-2xl p-4 shadow-sm">
                  <span className="text-2xl shrink-0">{b.icon}</span>
                  <div>
                    <p className="font-black text-on-surface text-sm">{b.title}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{b.desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <Link to="/beta" className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-rose-500/25 hover:shadow-xl">
                <span className="material-symbols-outlined text-lg" style={{ fontSize: '18px' }}>arrow_forward</span>
                {t.takeout?.cta || 'テイクアウト機能を試す'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="text-primary text-xs font-bold tracking-widest uppercase">{t.features.label}</span>
          <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3 whitespace-pre-line">{t.features.heading}</h2>
          <p className="text-on-surface-variant mt-4 max-w-lg mx-auto">{t.features.subheading}</p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { icon: 'rocket_launch' },         // 1. 회원가입 즉시 사용
            { icon: 'qr_code_scanner' },       // 2. QRスキャン
            { icon: 'shopping_bag' },          // 3. 테이크아웃 선결제
            { icon: 'notifications_active' },  // 4. 厨房通知
            { icon: 'dashboard' },             // 5. メニュー管理
            { icon: 'analytics' },             // 6. 売上分析
            { icon: 'devices' },               // 7. ハンディ無制限
            { icon: 'smartphone' },            // 8. マルチデバイス
            { icon: 'chat_bubble' },           // 9. LINE連携
            { icon: 'restaurant_menu' },       // 10. 食べ放題・飲み放題
            { icon: 'payments' },              // 11. Square・PayPay
            { icon: 'lock' },                  // 12. セキュリティ
          ].map((f, i) => (
            <div key={i} className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
              <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-2">{t.features.items[i].title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">{t.features.items[i].desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 bg-white border-y border-outline-variant/30 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-primary text-xs font-bold tracking-widest uppercase">{t.how.label}</span>
            <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3">{t.how.heading}</h2>
            <p className="text-on-surface-variant mt-4">{t.how.subheading}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {t.how.steps.map((step, i) => (
              <div key={i} className={`relative text-center ${i < 2 ? 'md:step-line' : ''}`}>
                <div className="relative inline-flex items-center justify-center w-14 h-14 bg-primary rounded-full text-white font-black text-xl shadow-lg shadow-primary/30 mb-5">
                  {i + 1}
                </div>
                <div className="bg-primary-fixed rounded-3xl p-6 text-center">
                  <div className="text-5xl mb-4">{['📱','🍽️','✅'][i]}</div>
                  <h3 className="font-bold text-on-surface mb-2">{step.title}</h3>
                  <p className="text-sm text-on-surface-variant">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 pt-16 border-t border-outline-variant/30">
            <p className="text-center text-sm font-medium text-on-surface-variant mb-8">{t.how.staffLabel}</p>
            <div className="grid md:grid-cols-4 gap-4">
              {t.how.staffSteps.map((s, i) => (
                <div key={i} className="bg-surface border border-outline-variant/20 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {['①','②','③','④'][i]}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-on-surface">{s.title}</div>
                    <div className="text-xs text-on-surface-variant mt-1">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOR RESTAURANT OWNERS */}
      <section id="for-owners" className="py-24 max-w-6xl mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-primary text-xs font-bold tracking-widest uppercase">{t.owners.label}</span>
            <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3 mb-6 whitespace-pre-line">
              {t.owners.heading}
            </h2>
            <p className="text-on-surface-variant leading-relaxed mb-8">{t.owners.desc}</p>
            <ul className="space-y-4">
              {t.owners.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-white" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>check</span>
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm">{b.title}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">{b.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Dashboard preview */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl overflow-hidden shadow-2xl shadow-primary/5">
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold">
                <span className="material-symbols-outlined" style={{fontSize:'18px', fontVariationSettings:"'FILL' 1"}}>dashboard</span>
                {t.owners.dashboard.title}
              </div>
              <div className="text-white/70 text-xs">{t.owners.dashboard.today} 2026/03/23</div>
            </div>
            <div className="grid grid-cols-3 gap-0 border-b border-outline-variant/30">
              <div className="p-4 text-center border-r border-outline-variant/30">
                <div className="text-2xl font-black text-on-surface">¥48,200</div>
                <div className="text-xs text-on-surface-variant mt-1">{t.owners.dashboard.sales}</div>
              </div>
              <div className="p-4 text-center border-r border-outline-variant/30">
                <div className="text-2xl font-black text-on-surface">127</div>
                <div className="text-xs text-on-surface-variant mt-1">{t.owners.dashboard.orders}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-2xl font-black text-on-surface">12</div>
                <div className="text-xs text-on-surface-variant mt-1">{t.owners.dashboard.tables}</div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t.owners.dashboard.latestOrders}</div>
              <div className="flex items-center justify-between p-3 bg-primary-fixed rounded-xl border border-primary/10">
                <div>
                  <div className="text-sm font-bold text-on-surface">{lang === 'ja' ? 'テーブル 5番' : 'Table 5'}</div>
                  <div className="text-xs text-on-surface-variant">{lang === 'ja' ? '醤油ラーメン × 2、餃子 × 1' : 'Soy Ramen × 2, Gyoza × 1'}</div>
                </div>
                <span className="text-xs bg-primary text-white px-2.5 py-1 rounded-full font-medium">{t.owners.dashboard.cooking}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface-container-high rounded-xl">
                <div>
                  <div className="text-sm font-bold text-on-surface">{lang === 'ja' ? 'テーブル 2番' : 'Table 2'}</div>
                  <div className="text-xs text-on-surface-variant">{lang === 'ja' ? '日替わり定食 × 1、生ビール × 2' : 'Daily Special × 1, Draft Beer × 2'}</div>
                </div>
                <span className="text-xs bg-tertiary-fixed text-on-tertiary-container px-2.5 py-1 rounded-full font-medium">{t.owners.dashboard.done}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface-container-high rounded-xl">
                <div>
                  <div className="text-sm font-bold text-on-surface">{lang === 'ja' ? 'テーブル 8番' : 'Table 8'}</div>
                  <div className="text-xs text-on-surface-variant">{lang === 'ja' ? 'にぎり寿司盛 × 2' : 'Nigiri Sushi Set × 2'}</div>
                </div>
                <span className="text-xs bg-secondary-fixed text-on-secondary-container px-2.5 py-1 rounded-full font-medium">{t.owners.dashboard.received}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 bg-slate-900 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-headline font-black text-white mt-3">{t.testimonials.heading}</h2>
            <p className="text-slate-400 mt-3 text-base">{t.testimonials.subheading}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.testimonials.items.map((item, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-3xl p-7">
                <div className="flex gap-1 mb-4">
                  <span className="text-primary-fixed-dim text-lg">{i < 2 ? '★★★★★' : '★★★★☆'}</span>
                </div>
                <p className="text-white/80 text-sm leading-relaxed mb-6">{item.quote}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/40 rounded-full flex items-center justify-center text-white font-bold">{item.avatar}</div>
                  <div>
                    <div className="text-white text-sm font-bold">{item.name}</div>
                    <div className="text-white/50 text-xs">{item.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 px-6 relative z-10" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block text-primary text-xs font-bold tracking-widest uppercase mb-2">{t.pricing.label}</span>
            <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mb-6">{t.pricing.heading}</h2>
            <p className="text-on-surface-variant max-w-2xl mx-auto">
              {t.pricing.subheading}
              <span className="text-primary font-bold">{t.pricing.subhighlighted}</span>
              {t.pricing.subtrail}
            </p>
            <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
              <span className="material-symbols-outlined text-amber-600" style={{fontSize:'16px'}}>savings</span>
              <span className="font-bold">{t.pricing.dataBadge}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Monthly */}
            <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 flex flex-col hover:shadow-lg transition-shadow">
              <div className="mb-6">
                <h3 className="text-xl font-headline font-bold text-on-surface mb-2">{t.pricing.plans[0].name}</h3>
                <p className="text-on-surface-variant text-sm">{t.pricing.plans[0].desc}</p>
              </div>
              <div className="mb-6 space-y-3">
                <div className="p-3 rounded-xl bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t.pricing.standardLabel}</div>
                  <span className="text-3xl font-black text-on-surface">{t.pricing.plans[0].price}</span>
                  <span className="text-on-surface-variant text-xs font-medium">{t.pricing.plans[0].period}</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">{t.pricing.dataLabel}</div>
                  <span className="text-3xl font-black text-amber-700">{t.pricing.plans[0].priceData}</span>
                  <span className="text-amber-700/80 text-xs font-medium">{t.pricing.plans[0].periodData}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {t.pricing.plans[0].features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-on-surface-variant text-sm">
                    <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors">
                {t.pricing.tryFree}
              </Link>
            </div>

            {/* 6-month */}
            <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 flex flex-col relative hover:shadow-lg transition-shadow">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-secondary text-white px-5 py-1.5 rounded-full text-xs font-bold shadow-md whitespace-nowrap">
                {t.pricing.plans[1].badge}
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-headline font-bold text-on-surface mb-2">{t.pricing.plans[1].name}</h3>
                <p className="text-on-surface-variant text-sm">{t.pricing.plans[1].desc}</p>
              </div>
              <div className="mb-6 space-y-3">
                <div className="p-3 rounded-xl bg-slate-50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t.pricing.plans[1].priceStdNote || t.pricing.standardLabel}</div>
                  <span className="text-3xl font-black text-on-surface">{t.pricing.plans[1].price}</span>
                  <span className="text-on-surface-variant text-xs font-medium">{t.pricing.plans[1].period}</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">{t.pricing.plans[1].priceDataNote || t.pricing.dataLabel}</div>
                  <span className="text-3xl font-black text-amber-700">{t.pricing.plans[1].priceData}</span>
                  <span className="text-amber-700/80 text-xs font-medium">{t.pricing.plans[1].periodData}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {t.pricing.plans[1].features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-on-surface-variant text-sm">
                    <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors">
                {t.pricing.tryFree}
              </Link>
            </div>

            {/* 12-month */}
            <div className="bg-primary-container p-8 rounded-2xl border border-primary flex flex-col relative shadow-2xl transform md:scale-105 z-10">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white border border-primary-container px-6 py-1.5 rounded-full text-xs font-bold shadow-md whitespace-nowrap">
                {t.pricing.plans[2].badge}
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-headline font-bold text-on-primary-container mb-2">{t.pricing.plans[2].name}</h3>
                <p className="text-on-primary-container/80 text-sm">{t.pricing.plans[2].desc}</p>
              </div>
              <div className="mb-6 space-y-3">
                <div className="p-3 rounded-xl bg-white/60">
                  <div className="text-[10px] font-bold text-on-primary-container/70 uppercase tracking-wider mb-1">{t.pricing.plans[2].priceStdNote || t.pricing.standardLabel}</div>
                  <span className="text-3xl font-black text-on-primary-container">{t.pricing.plans[2].price}</span>
                  <span className="text-on-primary-container/80 text-xs font-medium">{t.pricing.plans[2].period}</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300">
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">{t.pricing.plans[2].priceDataNote || t.pricing.dataLabel}</div>
                  <span className="text-3xl font-black text-amber-700">{t.pricing.plans[2].priceData}</span>
                  <span className="text-amber-700/80 text-xs font-medium">{t.pricing.plans[2].periodData}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {t.pricing.plans[2].features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-on-primary-container font-bold text-sm">
                    <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full bg-primary text-white font-bold shadow-lg hover:bg-on-primary-fixed-variant transition-colors">
                {t.pricing.startPlan}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-surface-container-low border-t border-outline-variant/30 relative z-10">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="w-16 h-16 bg-primary-container rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="9" fill="#c21e2f"/>
              <rect x="7" y="7" width="9" height="9" rx="1.5" fill="white"/>
              <rect x="9" y="9" width="5" height="5" rx="0.5" fill="#c21e2f"/>
              <rect x="20" y="7" width="9" height="9" rx="1.5" fill="white"/>
              <rect x="22" y="9" width="5" height="5" rx="0.5" fill="#c21e2f"/>
              <rect x="7" y="20" width="9" height="9" rx="1.5" fill="white"/>
              <rect x="9" y="22" width="5" height="5" rx="0.5" fill="#c21e2f"/>
              <rect x="20" y="20" width="4" height="4" rx="0.5" fill="white"/>
              <rect x="26" y="20" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="20" y="26" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="26" y="26" width="3" height="3" rx="0.5" fill="white"/>
            </svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mb-4">{t.cta.heading}</h2>
          <p className="text-on-surface-variant mb-8 leading-relaxed">{t.cta.desc}</p>
          <div className="flex justify-center max-w-sm mx-auto mb-6">
            <Link to="/owner/signup" className="w-full bg-primary hover:opacity-90 text-white font-bold px-8 py-4 rounded-full transition-all shadow-xl hover:shadow-2xl">
              {t.cta.button}
            </Link>
          </div>
          <p className="text-xs text-on-surface-variant">
            {t.cta.terms1}<Link to="/terms" className="text-primary hover:underline">{t.cta.terms2}</Link>{t.cta.terms3}<Link to="/privacy" className="text-primary hover:underline">{t.cta.terms4}</Link>{t.cta.terms5}
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="8" fill="#c21e2f"/>
                  <rect x="6" y="6" width="8" height="8" rx="1.5" fill="white"/>
                  <rect x="8" y="8" width="4" height="4" rx="0.5" fill="#c21e2f"/>
                  <rect x="18" y="6" width="8" height="8" rx="1.5" fill="white"/>
                  <rect x="20" y="8" width="4" height="4" rx="0.5" fill="#c21e2f"/>
                  <rect x="6" y="18" width="8" height="8" rx="1.5" fill="white"/>
                  <rect x="8" y="20" width="4" height="4" rx="0.5" fill="#c21e2f"/>
                  <rect x="18" y="18" width="3" height="3" rx="0.5" fill="white"/>
                  <rect x="23" y="18" width="3" height="3" rx="0.5" fill="white"/>
                  <rect x="18" y="23" width="3" height="3" rx="0.5" fill="white"/>
                  <rect x="23" y="23" width="3" height="3" rx="0.5" fill="white"/>
                </svg>
                <span className="text-white font-headline font-bold text-lg">QRaku</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">{t.footer.tagline}</p>
            </div>

            <div>
              <div className="text-white font-bold text-sm mb-4">{t.footer.product}</div>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">{t.footer.links.features}</a></li>
                <li><a href="#how" className="hover:text-white transition-colors">{t.footer.links.how}</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">{t.footer.links.pricing}</a></li>
                <li><Link to="/demo" className="hover:text-white transition-colors">{t.footer.links.demo}</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-white font-bold text-sm mb-4">{t.footer.company}</div>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.about}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.careers}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.blog}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.contact}</a></li>
              </ul>
            </div>

            <div>
              <div className="text-white font-bold text-sm mb-4">{t.footer.legal}</div>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/terms" className="hover:text-white transition-colors">{t.footer.links.terms}</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition-colors">{t.footer.links.privacy}</Link></li>
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.transactions}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t.footer.links.security}</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <span>© 2026 QRaku. All rights reserved.</span>
            <div className="flex items-center gap-3">
              <LangToggle lang={lang} setLang={setLang} dark />
              <span>{t.footer.langLabel}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingView;
