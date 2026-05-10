import { useNavigate } from 'react-router-dom'

const LINE_GREEN = '#06C755'

function StepCard({ num, title, children }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex gap-4">
            <div
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md"
                style={{ backgroundColor: LINE_GREEN }}
            >
                {num}
            </div>
            <div className="flex-1 space-y-2">
                <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
            </div>
        </div>
    )
}

export default function LineFriendGuideView() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ヘッダー */}
            <header
                className="text-white px-6 py-10 shadow-md"
                style={{
                    background: `linear-gradient(135deg, ${LINE_GREEN} 0%, #04A047 100%)`,
                }}
            >
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-3 mb-3">
                        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor" aria-hidden="true">
                            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-widest opacity-90">QRAKU × LINE</span>
                    </div>
                    <h1 className="text-3xl font-bold leading-tight">LINE 友だち追加 URL の取得方法</h1>
                    <p className="mt-2 text-sm opacity-90">
                        お客様の注文画面に「友だち追加」ボタンを表示するための設定ガイドです。
                    </p>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
                {/* 概要 */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="font-bold text-slate-800 text-lg mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined" style={{ color: LINE_GREEN }}>info</span>
                        この機能について
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        基本情報の <b>「LINE 友だち追加 URL」</b> 欄に LINE公式アカウントの友だち追加URL（例: <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">https://lin.ee/xxxxxxx</code>）を入力すると、お客様の注文画面のホームに <span className="font-bold" style={{ color: LINE_GREEN }}>緑色の「LINE 友だち追加」ボタン</span> が自動的に表示されます。
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed mt-2">
                        リピーター獲得・クーポン配信・新メニュー告知などにご活用いただけます。
                    </p>
                </section>

                {/* ステップ */}
                <h2 className="font-bold text-slate-700 text-base pl-2 pt-2">設定手順（5ステップ）</h2>

                <StepCard num={1} title="LINE公式アカウントを開設する">
                    <p>
                        まず <a href="https://www.linebiz.com/jp/entry/" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: LINE_GREEN }}>LINE for Business（公式サイト）</a> から LINE公式アカウントを無料で開設します。
                    </p>
                    <p className="text-xs text-slate-500">
                        ※ すでにお店の LINE公式アカウントをお持ちの方はステップ2へ進んでください。
                    </p>
                </StepCard>

                <StepCard num={2} title="LINE Official Account Manager にログイン">
                    <p>
                        <a href="https://manager.line.biz/" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: LINE_GREEN }}>LINE Official Account Manager</a> にアクセスし、開設したアカウントでログインします。
                    </p>
                </StepCard>

                <StepCard num={3} title="「友だち追加」メニューを開く">
                    <p>
                        管理画面 上部の <b>「ホーム」タブ</b> →  左メニューの <b>「友だちを増やす」</b> →  <b>「友だち追加ガイド」</b> を選択します。
                    </p>
                    <p>
                        または、左下の <b>「設定」</b> → <b>「アカウント設定」</b> ページにも友だち追加URLが記載されています。
                    </p>
                </StepCard>

                <StepCard num={4} title="友だち追加 URL をコピーする">
                    <p>
                        「友だち追加URL」と書かれた欄に <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">https://lin.ee/XXXXXXX</code> 形式のURLが表示されています。<br />
                        <b>コピーボタン</b> をクリックして URL をコピーしてください。
                    </p>
                    <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                        <b>💡 ヒント:</b> URLは <code className="bg-white px-1 rounded">https://lin.ee/</code> で始まる短縮URLです。QRコードの画像URLや、ブラウザ上でのアカウントページURLとは異なります。
                    </div>
                </StepCard>

                <StepCard num={5} title="QRAKU 管理画面に貼り付ける">
                    <p>
                        QRAKU 管理画面 ＞ <b>「基本情報」</b> セクション ＞ <b>「LINE 友だち追加 URL」</b> 欄に貼り付け、入力欄の外をクリックすると自動保存されます。
                    </p>
                    <p>
                        保存後、お客様のホーム画面に緑色の <b>「LINE 友だち追加」</b> ボタンが表示されます。
                    </p>
                </StepCard>

                {/* 注意事項 */}
                <section className="bg-amber-50 rounded-2xl border border-amber-200 p-6">
                    <h2 className="font-bold text-amber-800 text-base mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined">warning</span>
                        ご注意
                    </h2>
                    <ul className="text-sm text-amber-900 leading-relaxed space-y-1.5 list-disc pl-5">
                        <li>個人のLINEアカウントのURLではなく、必ず<b>「LINE公式アカウント」</b>のURLを使用してください。</li>
                        <li>URLを削除して空欄にすると、お客様画面のボタンも非表示になります。</li>
                        <li>LINE公式アカウントは無料プランでも月200通までメッセージ送信可能です。</li>
                    </ul>
                </section>

                {/* 戻るボタン */}
                <div className="flex justify-center pt-4 pb-10">
                    <button
                        onClick={() => window.close() || navigate(-1)}
                        className="px-8 py-3 rounded-xl font-bold text-white shadow-md hover:brightness-110 transition-all"
                        style={{ backgroundColor: LINE_GREEN }}
                    >
                        管理画面に戻る
                    </button>
                </div>
            </main>
        </div>
    )
}
