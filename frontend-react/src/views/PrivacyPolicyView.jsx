import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPolicyView() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-[#f8fafc]" style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');
                .pp-h2 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-top: 2rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px solid #bae6fd; }
                .pp-h3 { font-size: 0.95rem; font-weight: 700; color: #334155; margin-top: 1.25rem; margin-bottom: 0.5rem; }
                .pp-p  { font-size: 0.9rem; color: #475569; line-height: 1.9; margin-bottom: 0.75rem; }
                .pp-li { font-size: 0.9rem; color: #475569; line-height: 1.9; }
            `}</style>

            {/* ── ヘッダー ── */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-100 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-slate-500 hover:text-sky-500 transition-colors text-sm font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        戻る
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-sky-500 rounded-xl flex items-center justify-center shadow-sm shadow-sky-200">
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-lg font-black text-slate-900">QRaku プライバシーポリシー</span>
                    </div>
                </div>
            </header>

            {/* ── 本文 ── */}
            <main className="max-w-3xl mx-auto px-6 py-12">
                <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 md:p-12 space-y-2">

                    {/* タイトル */}
                    <div className="text-center mb-10">
                        <h1 className="text-3xl font-black text-slate-900 mb-2">プライバシーポリシー</h1>
                        <p className="text-sm text-slate-400">（個人情報保護方針）</p>
                        <p className="text-sm text-slate-400 mt-1">最終更新日：2024年3月18日</p>
                    </div>

                    <p className="pp-p">
                        QRaku（以下「当社」または「当サービス」といいます）は、利用者の個人情報の保護を最重要事項のひとつと位置づけ、以下のプライバシーポリシーに基づき個人情報を取り扱います。本ポリシーをよくお読みのうえ、ご利用ください。
                    </p>

                    {/* 1. 収集する情報 */}
                    <h2 className="pp-h2">1. 収集する個人情報の種類</h2>
                    <p className="pp-p">当サービスでは、以下の情報を収集する場合があります。</p>

                    <h3 className="pp-h3">① 飲食店オーナー・スタッフ（登録会員）</h3>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">氏名・メールアドレス・電話番号</li>
                        <li className="pp-li">店舗名・店舗住所・業種</li>
                        <li className="pp-li">Googleアカウント情報またはLINEアカウント情報（ソーシャルログイン利用時）</li>
                        <li className="pp-li">決済情報（クレジットカード番号等は決済代行会社が管理し、当社は保管しません）</li>
                        <li className="pp-li">サービス利用履歴・操作ログ</li>
                    </ul>

                    <h3 className="pp-h3">② ご来店のお客様（ゲストユーザー）</h3>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">端末識別子（ゲストID）：クッキーやローカルストレージを用いて自動生成</li>
                        <li className="pp-li">注文内容・注文履歴</li>
                        <li className="pp-li">アクセスログ（IPアドレス、ブラウザ種別、アクセス日時等）</li>
                        <li className="pp-li">ポイント取得・利用履歴（ロイヤリティプログラム利用時）</li>
                    </ul>

                    {/* 2. 利用目的 */}
                    <h2 className="pp-h2">2. 個人情報の利用目的</h2>
                    <p className="pp-p">収集した個人情報は、以下の目的のために利用します。</p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">本サービスの提供・運営・改善</li>
                        <li className="pp-li">利用者へのサポート対応・問い合わせへの回答</li>
                        <li className="pp-li">請求・決済処理</li>
                        <li className="pp-li">サービスに関するお知らせ・重要なメールの送信</li>
                        <li className="pp-li">新機能・キャンペーンのご案内（メールマガジン等）</li>
                        <li className="pp-li">不正アクセス・不正利用の検知・防止</li>
                        <li className="pp-li">統計データの作成（個人を特定しない形式で使用）</li>
                        <li className="pp-li">法令に基づく義務の履行</li>
                    </ul>

                    {/* 3. 第三者提供 */}
                    <h2 className="pp-h2">3. 個人情報の第三者提供</h2>
                    <p className="pp-p">
                        当社は、以下の場合を除き、利用者の同意なく個人情報を第三者に提供しません。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">法令に基づき開示が義務付けられる場合</li>
                        <li className="pp-li">人の生命・身体・財産の保護のために必要な場合</li>
                        <li className="pp-li">国の機関・地方公共団体等の法律上の事務に協力する場合</li>
                        <li className="pp-li">合併・事業譲渡等の際に事業を承継する者への提供（その旨を通知します）</li>
                    </ul>

                    <h3 className="pp-h3">業務委託先への提供</h3>
                    <p className="pp-p">
                        当社は、サービス提供のために必要な範囲で、以下のような業務委託先に個人情報を提供することがあります。委託先との間では個人情報保護に関する契約を締結し、適切な管理を行います。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">決済代行会社（Stripe等）</li>
                        <li className="pp-li">クラウドインフラ（Google Cloud Platform等）</li>
                        <li className="pp-li">翻訳API（DeepL、Google翻訳等）</li>
                        <li className="pp-li">メール送信サービス</li>
                    </ul>

                    {/* 4. Cookie */}
                    <h2 className="pp-h2">4. Cookieおよびトラッキング技術</h2>
                    <p className="pp-p">
                        当サービスは、Cookie・ローカルストレージ等のトラッキング技術を使用します。これらは、ログイン状態の維持・ゲストIDの管理・利用状況の分析等に利用されます。
                    </p>
                    <p className="pp-p">
                        ブラウザの設定によりCookieを無効にすることができますが、その場合、一部のサービス機能が正常に動作しない場合があります。
                    </p>

                    {/* 5. データ保管 */}
                    <h2 className="pp-h2">5. データの保存期間</h2>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">アカウント情報：退会から3年間保存後、削除</li>
                        <li className="pp-li">注文・取引履歴：法令（消費税法等）に基づき7年間保存</li>
                        <li className="pp-li">アクセスログ：90日間保存後、削除</li>
                        <li className="pp-li">ゲストIDおよびセッション情報：最終利用から12ヶ月</li>
                    </ul>

                    {/* 6. 安全管理 */}
                    <h2 className="pp-h2">6. 個人情報の安全管理</h2>
                    <p className="pp-p">
                        当社は、個人情報への不正アクセス・漏洩・滅失・毀損を防止するため、以下の安全管理措置を講じています。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li">通信の暗号化（HTTPS / TLS）</li>
                        <li className="pp-li">パスワードのハッシュ化（bcrypt等）</li>
                        <li className="pp-li">アクセス権の最小化・定期的な見直し</li>
                        <li className="pp-li">不正アクセス検知システムの導入</li>
                        <li className="pp-li">従業員への個人情報保護教育の実施</li>
                    </ul>

                    {/* 7. 権利 */}
                    <h2 className="pp-h2">7. 利用者の権利（開示・訂正・削除等）</h2>
                    <p className="pp-p">
                        利用者は、当社が保有する自己の個人情報について、以下の権利を有します。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="pp-li"><span className="font-bold">開示請求：</span>保有する個人情報の内容を確認する権利</li>
                        <li className="pp-li"><span className="font-bold">訂正・追加・削除：</span>誤りがある場合の訂正を求める権利</li>
                        <li className="pp-li"><span className="font-bold">利用停止・消去：</span>目的外利用が行われている場合の利用停止を求める権利</li>
                        <li className="pp-li"><span className="font-bold">メールマガジン配信停止：</span>いつでも配信停止の申請が可能</li>
                    </ul>
                    <p className="pp-p">
                        上記の権利行使をご希望の場合は、本ポリシー末尾の連絡先までご連絡ください。法令に基づき対応いたします。
                    </p>

                    {/* 8. 未成年 */}
                    <h2 className="pp-h2">8. 未成年者のご利用について</h2>
                    <p className="pp-p">
                        飲食店へのご来店によるサービス利用（QRメニュー閲覧・注文等）については年齢制限はございません。ただし、飲食店オーナーとしてのアカウント登録・料金プランの契約については、18歳以上の方に限ります。18歳未満の方が登録する場合は、保護者の同意が必要です。
                    </p>

                    {/* 9. 外部リンク */}
                    <h2 className="pp-h2">9. 外部サービスへのリンク</h2>
                    <p className="pp-p">
                        本サービスは、GoogleやLINEなどの外部サービスへのリンクを含む場合があります。これらの外部サービスにおける個人情報の取り扱いについては、各サービスのプライバシーポリシーをご確認ください。当社はこれらの外部サービスの個人情報の取り扱いについて、責任を負いません。
                    </p>

                    {/* 10. 改定 */}
                    <h2 className="pp-h2">10. プライバシーポリシーの改定</h2>
                    <p className="pp-p">
                        当社は、法令の改正・サービス内容の変更等に応じて、本ポリシーを予告なく変更することがあります。変更後の内容は、本サービス上に掲載した時点で効力を生じます。重要な変更について、メールにてお知らせすることがあります。
                    </p>

                    {/* お問い合わせ */}
                    <h2 className="pp-h2">お問い合わせ窓口（個人情報に関するご相談）</h2>
                    <div className="bg-sky-50 border border-sky-100 rounded-2xl p-5 text-sm text-slate-600 space-y-1">
                        <p className="font-bold text-slate-800">QRaku 個人情報保護窓口</p>
                        <p>メールアドレス：privacy@qraku.app</p>
                        <p>受付時間：平日 10:00〜18:00（土日祝を除く）</p>
                        <p className="text-xs text-slate-400 mt-2">
                            ご本人確認のため、ご連絡の際はご登録のメールアドレスからご連絡いただくか、本人確認書類のご提出をお願いする場合があります。
                        </p>
                    </div>

                    <p className="text-xs text-slate-400 text-right pt-6">
                        制定日：2024年1月1日　最終改定：2024年3月18日
                    </p>
                </div>
            </main>
        </div>
    )
}
