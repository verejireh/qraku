import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const LandingView = () => {
  useEffect(() => {
    document.title = "QRaku — QRコードでかんたん注文";
  }, []);

  return (
    <div className="font-body bg-surface text-on-surface min-h-screen overflow-x-hidden relative">
      {/* Inline styles for custom elements */}
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
          {/* Logo */}
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

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-on-surface-variant">
            <a href="#features" className="hover:text-primary transition-colors">機能</a>
            <a href="#how" className="hover:text-primary transition-colors">使い方</a>
            <a href="#for-owners" className="hover:text-primary transition-colors">飲食店の方へ</a>
            <a href="#pricing" className="hover:text-primary transition-colors">料金</a>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Link to="/owner/login" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">ログイン</Link>
            <Link to="/owner/signup" className="bg-primary hover:opacity-90 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all shadow-sm shadow-primary/20 hover:shadow-md">
              無料で始める
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero-bg relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center relative z-10">
          {/* Text */}
          <div className="relative z-10">
            <div className="fade-in-1 inline-flex items-center gap-2 bg-primary-fixed border border-primary/20 text-on-primary-fixed-variant text-xs font-bold px-3 py-1.5 rounded-full mb-6">
              <span className="material-symbols-outlined text-sm" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>bolt</span>
              テーブルにQRコードを置くだけ
            </div>
            <h1 className="fade-in-2 text-4xl md:text-5xl font-headline font-black leading-tight text-on-surface mb-5">
              注文がもっと<br/>
              <span className="text-primary">スムーズ</span>に、<br/>
              もっと<span className="text-primary">楽しく</span>。
            </h1>
            <p className="fade-in-3 text-base text-on-surface-variant leading-relaxed mb-8 max-w-md">
              QRakuは、QRコードをスキャンするだけでテーブルから直接注文・決済できる飲食店向けシステムです。
              スタッフの手間を減らし、お客様の満足度を高めます。
            </p>
            <div className="fade-in-4 flex flex-wrap gap-3">
              <Link to="/owner/signup" className="bg-primary hover:opacity-90 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-primary/25 hover:shadow-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{fontSize:'18px'}}>store</span>
                お店に導入する
              </Link>
              <Link to="/demo" className="bg-white hover:bg-surface-container-low text-on-surface font-medium px-7 py-3.5 rounded-full border border-outline-variant transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{fontSize:'18px'}}>play_circle</span>
                デモを見る
              </Link>
            </div>

            {/* Stats bar */}
            <div className="mt-12 flex gap-8">
              <div>
                <div className="text-2xl font-black text-on-surface">2,400<span className="text-primary">+</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">導入店舗数</div>
              </div>
              <div className="w-px bg-outline-variant/30"></div>
              <div>
                <div className="text-2xl font-black text-on-surface">98<span className="text-primary">%</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">オーナー満足度</div>
              </div>
              <div className="w-px bg-outline-variant/30"></div>
              <div>
                <div className="text-2xl font-black text-on-surface">3<span className="text-sm font-medium">分</span></div>
                <div className="text-xs text-on-surface-variant mt-0.5">導入セットアップ</div>
              </div>
            </div>
          </div>

          {/* Hero Illustration - Using Stitch Image */}
          <div className="relative flex justify-center items-center">
            <div className="float-anim relative z-10 w-full max-w-md">
              <img src="/images/hero_illustration.png" alt="QRaku Service Illustration" className="rounded-[2rem] w-full shadow-2xl" />
            </div>

            {/* Background blur circles */}
            <div className="absolute top-1/4 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-on-surface-variant opacity-40">
          <span className="text-xs">スクロール</span>
          <span className="material-symbols-outlined text-sm animate-bounce">keyboard_arrow_down</span>
        </div>
      </section>

      {/* LOGOS / SOCIAL PROOF */}
      <section className="border-y border-outline-variant/30 bg-white/60 py-8 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-xs text-on-surface-variant font-medium mb-6 tracking-widest uppercase">全国の飲食店で利用中</p>
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

      {/* FEATURES */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="text-primary text-xs font-bold tracking-widest uppercase">機能</span>
          <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3">飲食店の課題を<br/>まるごと解決</h2>
          <p className="text-on-surface-variant mt-4 max-w-lg mx-auto">QRakuは注文受付から決済まで、飲食店の業務を一気通貫でデジタル化します。</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>qr_code_scanner</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">QRスキャンで即注文</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              テーブルのQRコードをスキャンするだけ。アプリ不要でブラウザからすぐに注文できます。お客様の待ち時間を大幅削減。
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>notifications_active</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">リアルタイム厨房通知</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              注文が入ると即座にキッチンへWebSocket通知。オーダー漏れ・伝達ミスをゼロに。タブレット1台でキッチン管理が完結します。
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>dashboard</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">かんたんメニュー管理</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              管理ダッシュボードからメニューの追加・価格変更・在庫切れ設定がリアルタイムで反映。専門知識は一切不要です。
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>analytics</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">売上・注文分析</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              人気メニュー・ピーク時間帯・テーブル別売上など、データに基づいた経営判断をサポートします。
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>smartphone</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">マルチデバイス対応</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              iOS・Android・PC、あらゆる端末に最適化されたレスポンシブデザイン。お客様はアプリのインストール不要です。
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl p-7 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-primary text-2xl" style={{fontVariationSettings:"'FILL' 1"}}>lock</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">安心のセキュリティ</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              データは暗号化・国内サーバーで管理。PCI DSS準拠の決済処理で、お店とお客様の情報を安全に守ります。
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 bg-white border-y border-outline-variant/30 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-primary text-xs font-bold tracking-widest uppercase">使い方</span>
            <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3">3ステップで注文完了</h2>
            <p className="text-on-surface-variant mt-4">お客様はアプリ不要。スキャンして、選んで、注文するだけ。</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="relative text-center md:step-line">
              <div className="relative inline-flex items-center justify-center w-14 h-14 bg-primary rounded-full text-white font-black text-xl shadow-lg shadow-primary/30 mb-5">
                1
              </div>
              <div className="bg-primary-fixed rounded-3xl p-6 text-center">
                <div className="text-5xl mb-4">📱</div>
                <h3 className="font-bold text-on-surface mb-2">QRコードをスキャン</h3>
                <p className="text-sm text-on-surface-variant">テーブルのQRコードをスマートフォンのカメラで読み取るだけ。専用アプリは不要です。</p>
              </div>
            </div>

            <div className="relative text-center md:step-line">
              <div className="relative inline-flex items-center justify-center w-14 h-14 bg-primary rounded-full text-white font-black text-xl shadow-lg shadow-primary/30 mb-5">
                2
              </div>
              <div className="bg-primary-fixed rounded-3xl p-6 text-center">
                <div className="text-5xl mb-4">🍽️</div>
                <h3 className="font-bold text-on-surface mb-2">メニューを選ぶ</h3>
                <p className="text-sm text-on-surface-variant">写真付きのデジタルメニューから好みの料理を選択。カートに追加して数量調整も簡単。</p>
              </div>
            </div>

            <div className="relative text-center">
              <div className="relative inline-flex items-center justify-center w-14 h-14 bg-primary rounded-full text-white font-black text-xl shadow-lg shadow-primary/30 mb-5">
                3
              </div>
              <div className="bg-primary-fixed rounded-3xl p-6 text-center">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="font-bold text-on-surface mb-2">注文して待つだけ</h3>
                <p className="text-sm text-on-surface-variant">「注文する」ボタンを押すと厨房へ即時通知。あとは料理が来るのを待つだけ。</p>
              </div>
            </div>
          </div>

          {/* Owner flow */}
          <div className="mt-16 pt-16 border-t border-outline-variant/30">
            <p className="text-center text-sm font-medium text-on-surface-variant mb-8">店舗スタッフ側の流れ</p>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-surface border border-outline-variant/20 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">①</div>
                <div>
                  <div className="text-sm font-bold text-on-surface">QRコード印刷</div>
                  <div className="text-xs text-on-surface-variant mt-1">テーブル番号付きQRを管理画面から生成・印刷</div>
                </div>
              </div>
              <div className="bg-surface border border-outline-variant/20 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">②</div>
                <div>
                  <div className="text-sm font-bold text-on-surface">注文通知受信</div>
                  <div className="text-xs text-on-surface-variant mt-1">お客様が注文すると即座に厨房タブレットへ通知</div>
                </div>
              </div>
              <div className="bg-surface border border-outline-variant/20 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">③</div>
                <div>
                  <div className="text-sm font-bold text-on-surface">調理・提供</div>
                  <div className="text-xs text-on-surface-variant mt-1">ステータスを「完了」に変更してテーブルへ提供</div>
                </div>
              </div>
              <div className="bg-surface border border-outline-variant/20 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm shrink-0">④</div>
                <div>
                  <div className="text-sm font-bold text-on-surface">売上自動集計</div>
                  <div className="text-xs text-on-surface-variant mt-1">日次・月次の売上がダッシュボードに自動集計</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOR RESTAURANT OWNERS */}
      <section id="for-owners" className="py-24 max-w-6xl mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-primary text-xs font-bold tracking-widest uppercase">飲食店の方へ</span>
            <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mt-3 mb-6">
              スタッフ不足でも<br/>
              売上を落とさない
            </h2>
            <p className="text-on-surface-variant leading-relaxed mb-8">
              人手不足が深刻な飲食業界で、QRakuは少人数でも高品質なサービスを提供できる環境を実現します。
              注文受付の自動化により、スタッフはお客様への接客や料理提供に集中できます。
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-white" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>check</span>
                </div>
                <div>
                  <div className="font-bold text-on-surface text-sm">注文受付にかかる時間を最大70%削減</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">口頭での注文ミスがゼロになり、回転率が向上します</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-white" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>check</span>
                </div>
                <div>
                  <div className="font-bold text-on-surface text-sm">初期費用ゼロ・60日間無料・月額2,480円から</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">ハードウェア購入不要。既存のタブレットをそのまま活用できます</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-white" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>check</span>
                </div>
                <div>
                  <div className="font-bold text-on-surface text-sm">最短3分でセットアップ完了</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">IT知識不要。ガイドに従うだけで今日から使い始められます</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-white" style={{fontSize:'14px', fontVariationSettings:"'FILL' 1"}}>check</span>
                </div>
                <div>
                  <div className="font-bold text-on-surface text-sm">24時間サポート対応</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">チャット・電話・メールで専任スタッフがサポートします</div>
                </div>
              </li>
            </ul>
          </div>

          {/* Dashboard preview */}
          <div className="bg-white border border-outline-variant/40 rounded-3xl overflow-hidden shadow-2xl shadow-primary/5">
            {/* Dashboard header */}
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold">
                <span className="material-symbols-outlined" style={{fontSize:'18px', fontVariationSettings:"'FILL' 1"}}>dashboard</span>
                管理ダッシュボード
              </div>
              <div className="text-white/70 text-xs">本日 2026/03/23</div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-0 border-b border-outline-variant/30">
              <div className="p-4 text-center border-r border-outline-variant/30">
                <div className="text-2xl font-black text-on-surface">¥48,200</div>
                <div className="text-xs text-on-surface-variant mt-1">本日の売上</div>
              </div>
              <div className="p-4 text-center border-r border-outline-variant/30">
                <div className="text-2xl font-black text-on-surface">127</div>
                <div className="text-xs text-on-surface-variant mt-1">注文数</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-2xl font-black text-on-surface">12</div>
                <div className="text-xs text-on-surface-variant mt-1">テーブル数</div>
              </div>
            </div>

            {/* Orders list */}
            <div className="p-4 space-y-3">
              <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">最新の注文</div>
              <div className="flex items-center justify-between p-3 bg-primary-fixed rounded-xl border border-primary/10">
                <div>
                  <div className="text-sm font-bold text-on-surface">テーブル 5番</div>
                  <div className="text-xs text-on-surface-variant">醤油ラーメン × 2、餃子 × 1</div>
                </div>
                <span className="text-xs bg-primary text-white px-2.5 py-1 rounded-full font-medium">調理中</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface-container-high rounded-xl">
                <div>
                  <div className="text-sm font-bold text-on-surface">テーブル 2番</div>
                  <div className="text-xs text-on-surface-variant">日替わり定食 × 1、生ビール × 2</div>
                </div>
                <span className="text-xs bg-tertiary-fixed text-on-tertiary-container px-2.5 py-1 rounded-full font-medium">完了</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface-container-high rounded-xl">
                <div>
                  <div className="text-sm font-bold text-on-surface">テーブル 8番</div>
                  <div className="text-xs text-on-surface-variant">にぎり寿司盛 × 2</div>
                </div>
                <span className="text-xs bg-secondary-fixed text-on-secondary-container px-2.5 py-1 rounded-full font-medium">受付済</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 bg-slate-900 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-headline font-black text-white mt-3">お客様の声</h2>
            <p className="text-slate-400 mt-3 text-base">導入店舗からの評判</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-7">
              <div className="flex gap-1 mb-4">
                <span className="text-primary-fixed-dim text-lg">★★★★★</span>
              </div>
              <p className="text-white/80 text-sm leading-relaxed mb-6">
                「注文受付のストレスが激減しました。お客様が自分でスキャンして注文してくれるので、スタッフが料理提供に集中できるようになりました。」
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/40 rounded-full flex items-center justify-center text-white font-bold">田</div>
                <div>
                  <div className="text-white text-sm font-bold">田中 誠</div>
                  <div className="text-white/50 text-xs">居酒屋 はなまる オーナー</div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-7">
              <div className="flex gap-1 mb-4">
                <span className="text-primary-fixed-dim text-lg">★★★★★</span>
              </div>
              <p className="text-white/80 text-sm leading-relaxed mb-6">
                「導入3ヶ月でテーブル回転率が15%向上。メニュー変更もスマホから即反映できるので、季節限定メニューの運用がとても楽になりました。」
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/40 rounded-full flex items-center justify-center text-white font-bold">山</div>
                <div>
                  <div className="text-white text-sm font-bold">山田 佳子</div>
                  <div className="text-white/50 text-xs">ダイニングカフェ 店長</div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-7">
              <div className="flex gap-1 mb-4">
                <span className="text-primary-fixed-dim text-lg">★★★★☆</span>
              </div>
              <p className="text-white/80 text-sm leading-relaxed mb-6">
                「外国人のお客様にも好評です。言語バリアなくスムーズに注文できると喜んでいただいています。サポートも丁寧で助かっています。」
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/40 rounded-full flex items-center justify-center text-white font-bold">鈴</div>
                <div>
                  <div className="text-white text-sm font-bold">鈴木 健一</div>
                  <div className="text-white/50 text-xs">焼肉レストラン 代表</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 px-6 relative z-10" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
          <span className="inline-block text-primary text-xs font-bold tracking-widest uppercase mb-2">
            料金
          </span>
          <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mb-6">
            選べる3つのプラン
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            すべての機能が利用可能。今なら
            <span className="text-primary font-bold">
            60日間の無料トライアル
            </span>
            で、実際の店舗運営でお試しいただけます。
          </p>
          <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
            <span className="material-symbols-outlined text-amber-600" style={{fontSize:'16px'}}>savings</span>
            <span className="font-bold">データ公開に同意で、全プラン月 ¥1,000 割引</span>
          </div>
          </div>

          {/* 価格比較テーブル */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Monthly Plan */}
          <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 flex flex-col hover:shadow-lg transition-shadow">
            <div className="mb-6">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">月払いプラン</h3>
              <p className="text-on-surface-variant text-sm">まずは気軽に始めたい方に</p>
            </div>
            <div className="mb-6 space-y-3">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">通常</div>
                <span className="text-3xl font-black text-on-surface">¥3,480</span>
                <span className="text-on-surface-variant text-xs font-medium">/月</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">データ公開同意時</div>
                <span className="text-3xl font-black text-amber-700">¥2,480</span>
                <span className="text-amber-700/80 text-xs font-medium">/月</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-2 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                全機能アクセス可能
              </li>
              <li className="flex items-center gap-2 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                初期費用 0円・60日間無料
              </li>
            </ul>
            <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors">
              無料で試す
            </Link>
          </div>

          {/* 6-Month Plan */}
          <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 flex flex-col relative hover:shadow-lg transition-shadow">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-secondary text-white px-5 py-1.5 rounded-full text-xs font-bold shadow-md">
              約14%お得
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">6ヶ月プラン</h3>
              <p className="text-on-surface-variant text-sm">しっかり運用を始めたい方に</p>
            </div>
            <div className="mb-6 space-y-3">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">通常 (月額¥2,980相当)</div>
                <span className="text-3xl font-black text-on-surface">¥17,880</span>
                <span className="text-on-surface-variant text-xs font-medium">/6ヶ月</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">データ公開同意時 (月額¥1,980相当)</div>
                <span className="text-3xl font-black text-amber-700">¥11,880</span>
                <span className="text-amber-700/80 text-xs font-medium">/6ヶ月</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-2 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                一括払いでお得
              </li>
              <li className="flex items-center gap-2 text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                優先チャットサポート
              </li>
            </ul>
            <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors">
              無料で試す
            </Link>
          </div>

          {/* 12-Month Plan */}
          <div className="bg-primary-container p-8 rounded-2xl border border-primary flex flex-col relative shadow-2xl transform md:scale-105 z-10">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white border border-primary-container px-6 py-1.5 rounded-full text-xs font-bold shadow-md whitespace-nowrap">
              最安値・約40%お得
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-headline font-bold text-on-primary-container mb-2">12ヶ月プラン</h3>
              <p className="text-on-primary-container/80 text-sm">長期的な店舗DXを目指す方に</p>
            </div>
            <div className="mb-6 space-y-3">
              <div className="p-3 rounded-xl bg-white/60">
                <div className="text-[10px] font-bold text-on-primary-container/70 uppercase tracking-wider mb-1">通常 (月額¥2,483相当)</div>
                <span className="text-3xl font-black text-on-primary-container">¥29,800</span>
                <span className="text-on-primary-container/80 text-xs font-medium">/年</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300">
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">データ公開同意時 (月額¥1,483相当)</div>
                <span className="text-3xl font-black text-amber-700">¥17,800</span>
                <span className="text-amber-700/80 text-xs font-medium">/年</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-2 text-on-primary-container font-bold text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                年間で最もお得なプラン
              </li>
              <li className="flex items-center gap-2 text-on-primary-container font-bold text-sm">
                <span className="material-symbols-outlined text-primary text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
                導入支援コンサルティング付
              </li>
            </ul>
            <Link to="/owner/signup" className="block text-center w-full py-3.5 rounded-full bg-primary text-white font-bold shadow-lg hover:bg-on-primary-fixed-variant transition-colors">
              このプランで始める
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
          <h2 className="text-3xl md:text-4xl font-headline font-black text-on-surface mb-4">
            今日から始めましょう
          </h2>
          <p className="text-on-surface-variant mb-8 leading-relaxed">
            14日間無料トライアル実施中。クレジットカード不要、いつでもキャンセル可能。
            まずはお気軽にお試しください。
          </p>

          {/* Email form replacement - direct to signup */}
          <div className="flex justify-center max-w-sm mx-auto mb-6">
            <Link to="/owner/signup" className="w-full bg-primary hover:opacity-90 text-white font-bold px-8 py-4 rounded-full transition-all shadow-xl hover:shadow-2xl">
              無料でアカウント作成
            </Link>
          </div>
          <p className="text-xs text-on-surface-variant">
            登録することで<Link to="/terms" className="text-primary hover:underline">利用規約</Link>・<Link to="/privacy" className="text-primary hover:underline">プライバシーポリシー</Link>に同意したものとみなします
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
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
              <p className="text-sm leading-relaxed text-slate-400">QRコードでかんたん・楽しく注文できる飲食店向けオーダーシステム</p>
            </div>

            {/* Product */}
            <div>
              <div className="text-white font-bold text-sm mb-4">プロダクト</div>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">機能一覧</a></li>
                <li><a href="#how" className="hover:text-white transition-colors">使い方</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">料金プラン</a></li>
                <li><Link to="/demo" className="hover:text-white transition-colors">デモを見る</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <div className="text-white font-bold text-sm mb-4">会社情報</div>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">会社概要</a></li>
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">採用情報</a></li>
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">ブログ</a></li>
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">お問い合わせ</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <div className="text-white font-bold text-sm mb-4">法的情報</div>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/terms" className="hover:text-white transition-colors text-slate-400">利用規約</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition-colors text-slate-400">プライバシーポリシー</Link></li>
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">特定商取引法</a></li>
                <li><a href="#" className="hover:text-white transition-colors text-slate-400">セキュリティ</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <span>© 2026 QRaku. All rights reserved.</span>
            <span>日本語 · 🇯🇵</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingView;
