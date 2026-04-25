import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsOfServiceView() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-[#f8fafc]" style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');
                .terms-h2 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-top: 2rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px solid #ffd9df; }
                .terms-h3 { font-size: 0.95rem; font-weight: 700; color: #334155; margin-top: 1.25rem; margin-bottom: 0.5rem; }
                .terms-p { font-size: 0.9rem; color: #475569; line-height: 1.9; margin-bottom: 0.75rem; }
                .terms-li { font-size: 0.9rem; color: #475569; line-height: 1.9; }
            `}</style>

            {/* ── ヘッダー ── */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-100 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-slate-500 hover:text-rose-500 transition-colors text-sm font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        戻る
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center shadow-sm shadow-rose-200">
                            <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-lg font-black text-slate-900">QRaku 利用規約</span>
                    </div>
                </div>
            </header>

            {/* ── 本文 ── */}
            <main className="max-w-3xl mx-auto px-6 py-12">
                <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 md:p-12 space-y-2">

                    {/* タイトル */}
                    <div className="text-center mb-10">
                        <h1 className="text-3xl font-black text-slate-900 mb-2">利用規約</h1>
                        <p className="text-sm text-slate-400">最終更新日：2026年4月24日</p>
                    </div>

                    <p className="terms-p">
                        本利用規約（以下「本規約」といいます）は、QRaku（以下「当サービス」または「当社」といいます）が提供するQR注文管理サービス「QRaku」（以下「本サービス」といいます）の利用条件を定めるものです。ご利用の前に本規約をよくお読みください。
                    </p>

                    {/* 第1条 */}
                    <h2 className="terms-h2">第1条（本規約への同意）</h2>
                    <p className="terms-p">
                        利用者（飲食店オーナー・スタッフおよびお客様を含みます。以下同じ）は、本サービスを利用することにより、本規約のすべてに同意されたものとみなします。本規約に同意いただけない場合は、本サービスをご利用いただくことはできません。
                    </p>

                    {/* 第2条 */}
                    <h2 className="terms-h2">第2条（サービスの概要）</h2>
                    <p className="terms-p">
                        本サービスは、飲食店向けのQRコードを使ったスマートメニュー・モバイルオーダーシステムです。主な機能は以下のとおりです。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">QRコードを利用したデジタルメニューの提供</li>
                        <li className="terms-li">多言語（日本語・英語・韓国語・中国語等）への自動翻訳</li>
                        <li className="terms-li">テーブルオーダー・決済機能</li>
                        <li className="terms-li">売上・注文データの分析・管理</li>
                        <li className="terms-li">ロイヤリティポイントプログラム</li>
                    </ul>

                    {/* 第3条 */}
                    <h2 className="terms-h2">第3条（利用登録）</h2>
                    <h3 className="terms-h3">3-1. 登録申請</h3>
                    <p className="terms-p">
                        飲食店オーナーとして本サービスを利用するには、所定の登録フォームに必要事項を入力し、当社が承認した時点で利用登録が完了します。GoogleまたはLINEアカウントによるソーシャルログインも利用可能です。
                    </p>
                    <h3 className="terms-h3">3-2. 登録情報の真実性</h3>
                    <p className="terms-p">
                        利用者は、登録情報について真実かつ正確な情報を入力する義務を負います。虚偽の情報を提供した場合、当社は通知なく利用登録を取り消すことがあります。
                    </p>
                    <h3 className="terms-h3">3-3. アカウントの管理</h3>
                    <p className="terms-p">
                        利用者はパスワード・アクセス情報を厳重に管理する責任を負います。第三者によるアカウントの不正利用について、当社は一切の責任を負いません。
                    </p>

                    {/* 第4条 */}
                    <h2 className="terms-h2">第4条（無料体験期間と料金プラン）</h2>
                    <p className="terms-p">
                        新規登録から<strong>60日間</strong>は無料体験期間としてすべての機能をご利用いただけます。体験期間終了後は、以下のいずれかの有償プランへの加入が必要です。
                    </p>
                    <h3 className="terms-h3">4-1. 標準プラン</h3>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">月払いプラン：¥3,480 / 月</li>
                        <li className="terms-li">6ヶ月プラン：¥17,880（月額換算 ¥2,980相当）</li>
                        <li className="terms-li">12ヶ月プラン：¥29,800（月額換算 ¥2,483相当、最安）</li>
                    </ul>
                    <h3 className="terms-h3">4-2. データ公開同意プラン（月額¥1,000割引）</h3>
                    <p className="terms-p">
                        第9条に定める「データ公開」に同意した利用者は、以下の割引価格が適用されます。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">月払いプラン：¥2,480 / 月</li>
                        <li className="terms-li">6ヶ月プラン：¥11,880（月額換算 ¥1,980相当）</li>
                        <li className="terms-li">12ヶ月プラン：¥17,800（月額換算 ¥1,483相当、最安）</li>
                    </ul>
                    <p className="terms-p">
                        料金は事前に決済される前払い制です。プランの変更・解約は、当社が定める手続きにより行えます。原則として既にお支払いいただいた料金の返金はいたしません。データ公開同意は決済時に選択でき、次回の契約更新時に変更可能です。
                    </p>

                    {/* 第5条 */}
                    <h2 className="terms-h2">第5条（禁止事項）</h2>
                    <p className="terms-p">利用者は、以下の行為を行ってはなりません。</p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">法令または公序良俗に違反する行為</li>
                        <li className="terms-li">当社または第三者の知的財産権・プライバシー・名誉を侵害する行為</li>
                        <li className="terms-li">本サービスのシステムやネットワークへの不正アクセス・攻撃</li>
                        <li className="terms-li">虚偽・誤解を招く情報の掲載</li>
                        <li className="terms-li">本サービスを通じたスパムまたは不正な商業行為</li>
                        <li className="terms-li">本サービスの逆コンパイル・リバースエンジニアリング</li>
                        <li className="terms-li">その他、当社が不適切と判断する行為</li>
                    </ul>

                    {/* 第6条 */}
                    <h2 className="terms-h2">第6条（知的財産権）</h2>
                    <p className="terms-p">
                        本サービスに関連するすべてのコンテンツ（ロゴ、デザイン、ソースコード、テキスト等）の知的財産権は当社または正当な権利者に帰属します。利用者は、本規約の範囲内で本サービスを利用する権利を付与されるものとし、その他の利用は禁止されます。
                    </p>
                    <p className="terms-p">
                        利用者がアップロードしたメニュー画像・テキスト等のコンテンツについては、利用者が著作権を保有します。当社は、本サービス提供のために必要な範囲でこれらのコンテンツを利用できるものとします。
                    </p>

                    {/* 第7条 */}
                    <h2 className="terms-h2">第7条（サービスの変更・中断・終了）</h2>
                    <p className="terms-p">
                        当社は、以下の場合にサービスを事前通知なく変更・中断・終了する場合があります。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">システムのメンテナンスまたは緊急対応が必要な場合</li>
                        <li className="terms-li">天災・停電・通信障害などの不可抗力が生じた場合</li>
                        <li className="terms-li">サービスの運営上やむを得ない事情が生じた場合</li>
                    </ul>
                    <p className="terms-p">
                        これらにより生じた損害については、当社は責任を負いません。
                    </p>

                    {/* 第8条 */}
                    <h2 className="terms-h2">第8条（免責事項）</h2>
                    <p className="terms-p">
                        当社は、本サービスに関して以下の事項について責任を負いません。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">本サービスの利用により生じた利用者または第三者の損害</li>
                        <li className="terms-li">本サービスの一時的な停止・障害によって生じる逸失利益</li>
                        <li className="terms-li">Google翻訳・DeepL等の外部APIに起因する翻訳の誤り</li>
                        <li className="terms-li">利用者間のトラブル</li>
                    </ul>
                    <p className="terms-p">
                        法令上適用される場合を除き、当社の損害賠償責任は、過去3ヶ月に利用者が支払った利用料金の合計額を上限とします。
                    </p>

                    {/* 第9条 */}
                    <h2 className="terms-h2">第9条（データ公開同意プランについて）</h2>
                    <h3 className="terms-h3">9-1. 目的</h3>
                    <p className="terms-p">
                        データ公開同意プラン（以下「公開プラン」といいます）は、店舗のメニュー情報・商品写真・店舗紹介文等を当社が運営する公開ディレクトリ（QRaku掲載ページ、提携メディア、検索結果等）に掲載することにより、利用者の集客・広告効果を増進することを目的としたプランです。その対価として、当社は月額¥1,000相当の利用料金を割引いたします。
                    </p>

                    <h3 className="terms-h3">9-2. 公開対象データ</h3>
                    <p className="terms-p">公開プランに同意した場合、以下のデータが公開対象となります。</p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">店舗名、店舗ロゴ、店舗紹介文、営業時間、住所、電話番号、テーマ画像</li>
                        <li className="terms-li">メニュー名、メニュー説明、メニュー価格、メニュー画像、カテゴリ情報</li>
                        <li className="terms-li">日替わり特選メニュー、テイクアウト可否等の販売形態情報</li>
                        <li className="terms-li">地域（都道府県・市区町村）情報</li>
                    </ul>

                    <h3 className="terms-h3">9-3. 公開対象外データ</h3>
                    <p className="terms-p">以下のデータは公開プラン同意の有無にかかわらず、第三者に公開されることはありません。</p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">売上データ、注文履歴、客単価、来客数等の経営情報</li>
                        <li className="terms-li">お客様個人を特定できる情報（氏名、連絡先、決済情報、LINE ID、ポイント残高等）</li>
                        <li className="terms-li">スタッフ情報、管理者PIN、パスワード、APIキー等の認証情報</li>
                        <li className="terms-li">Square / PayPay 等の決済連携の認証情報および取引履歴</li>
                    </ul>

                    <h3 className="terms-h3">9-4. 公開範囲と利用許諾</h3>
                    <p className="terms-p">
                        公開プランに同意した場合、利用者は当社に対し、前項9-2に定める公開対象データを、本サービスおよび当社が指定する媒体（ウェブサイト、モバイルアプリ、SNS、提携先メディア、検索エンジン連携等）において、地理的制限なく、無償かつ非独占的に使用・複製・公衆送信・翻訳・二次利用することを許諾するものとします。
                    </p>
                    <p className="terms-p">
                        ただし、当社は公開データを利用者の同意なく第三者に販売・譲渡することはいたしません。広告・集客目的に限り利用します。
                    </p>

                    <h3 className="terms-h3">9-5. 同意の撤回</h3>
                    <p className="terms-p">
                        利用者は、次回の契約更新タイミングにおいて公開同意を撤回することができます。撤回後は標準プランの料金（第4条4-1）が適用されます。なお、既に外部検索エンジンにキャッシュされた情報や、提携メディアに掲載された情報の削除には合理的な期間を要する場合があります。
                    </p>

                    <h3 className="terms-h3">9-6. データの正確性・責任</h3>
                    <p className="terms-p">
                        公開されるデータの内容（価格、アレルギー情報、営業時間等）の正確性については、利用者が責任を負います。当社は、利用者が入力したデータをそのまま公開するものであり、内容の誤りによって生じた損害について責任を負いません。
                    </p>

                    <h3 className="terms-h3">9-7. 公開の停止</h3>
                    <p className="terms-p">
                        以下のいずれかに該当する場合、当社は公開プランの適用を事前通知なく停止し、標準プラン料金への切り替えを行うことができます。
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-4">
                        <li className="terms-li">公開データに法令違反・公序良俗違反の内容が含まれる場合</li>
                        <li className="terms-li">第三者の権利を侵害する内容（無断転載画像、虚偽表示等）が確認された場合</li>
                        <li className="terms-li">長期間メニューや営業情報が更新されていない場合</li>
                    </ul>

                    {/* 第10条 */}
                    <h2 className="terms-h2">第10条（規約の変更）</h2>
                    <p className="terms-p">
                        当社は、必要と判断した場合、本規約を変更することができます。変更後の規約は、本サービス上に掲載した時点で効力を生じます。変更後も本サービスを継続して利用した場合、変更後の規約に同意したものとみなします。
                    </p>

                    {/* 第11条 */}
                    <h2 className="terms-h2">第11条（準拠法・管轄裁判所）</h2>
                    <p className="terms-p">
                        本規約の解釈および適用は、日本法に準拠します。本サービスに関連して紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
                    </p>

                    {/* お問い合わせ */}
                    <h2 className="terms-h2">お問い合わせ</h2>
                    <p className="terms-p">
                        本規約に関するご質問は、下記までお問い合わせください。
                    </p>
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 text-sm text-slate-600 space-y-1">
                        <p className="font-bold text-slate-800">QRaku サポートチーム</p>
                        <p>メール：support@qraku.app</p>
                        <p>受付時間：平日 10:00〜18:00（土日祝を除く）</p>
                    </div>

                    <p className="text-xs text-slate-400 text-right pt-6">制定日：2024年1月1日　最終改定：2026年4月24日</p>
                </div>
            </main>
        </div>
    )
}
