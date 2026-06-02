// 사장님 전환 LP(/owner) 카피 — 단일 출처: qraku-marketing/assets/2026-06-01-owner-landing-page.md (MKT-23)
// ⚠️ 카피 변경 시 코드에서 임의 수정 금지. 마케팅 측 정본을 통해 반영할 것.
// ja 필수(전체). en/ko 는 슬롯만 — 채워지기 전까지 ja 로 폴백.

// §12 자이라 확정 대기 — 확정되면 아래 값만 교체
export const ownerLpContact = {
  phone: '',                 // TODO(자이라): 전화번호 확정 대기
  email: 'jaira@qraku.com',
  site: 'qraku.com/owner',
  company: 'QRaku 株式会社 | 御殿場',
}

const ja = {
  // 5-0. Sticky 헤더
  brand: 'QRaku Local',
  navCta: '無料で相談',

  // 5-1. Hero
  hero: {
    h1: '食品ロスをへらして、月3万円増収。',
    sub1: '御殿場のカフェ・飲食店のための',
    sub2: 'QR注文 + 食品ロス削減 + 多言語対応 オールインワン。',
    ctaPrimary: '無料で相談する',
    ctaSecondary: '14日間 無料で試す',
    note: '御殿場エリア 最初の50店舗は初年度無料。',
    campaignBadge: '御殿場エリア限定 50店舗',
  },

  // 5-2. Pain
  pain: {
    title: 'こんなお悩み、ありませんか？',
    items: [
      '閉店前に残ったパンやお惣菜、毎日もったいないと感じている',
      '海外のお客様への注文対応に、毎回手間がかかっている',
      '常連さんが何度来てくれているのか、手元に記録が残らない',
    ],
    close: 'QRaku Local は、この3つを「ひとつの仕組み」で解決します。',
  },

  // 5-3. USP 3블록
  usp: [
    {
      icon: 'tag',
      title: '駆け込みセール',
      body: '閉店30分前からの自動割引。設定は1回、あとはQRakuが自動で。廃棄予定の在庫が、売上に変わります。',
    },
    {
      icon: 'globe',
      title: '多言語ミニホームページ',
      body: '日本語・英語・韓国語・中国語のお店ページが自動生成。Google Maps にも掲載でき、海外のお客様も迷わず注文できます。',
    },
    {
      icon: 'map-pin',
      title: 'QRaku マップ',
      body: '歩いて10分圏内のお客様が、今あなたのお店を見つけます。アウトレットの買い物客も、富士山の観光客も、地元のお客様も。',
    },
  ],

  // 5-4. 料金 / 비교표
  price: {
    title: '料金',
    rows: [
      { label: '通常', value: '月¥3,480' },
      { label: '情報公開にご協力で', value: '月¥2,480（月¥1,000割引）' },
      { label: '無料体験', value: '14日間' },
    ],
    special: '御殿場特別: 最初の50店舗は初年度 完全無料（¥41,760相当）',
    table: {
      head: ['', 'QRaku', 'A社', 'B社'],
      rows: [
        { label: '月額', qraku: '¥0*', a: '¥15,400', b: '¥13,200' },
        { label: '食品ロス対策', qraku: '✅', a: '―', b: '―' },
        { label: '多言語', qraku: '✅', a: '―', b: '―' },
        { label: '近隣発見', qraku: '✅', a: '―', b: '―' },
      ],
      note: '* 御殿場 初年度無料特典の場合',
    },
  },

  // 5-5. 特典 배너
  perk: {
    badge: '🎁 御殿場エリア限定',
    lines: [
      '最初の50店舗 → 初年度 完全無料（¥41,760相当）',
      '2年目以降も 月¥2,480（情報公開ご協力で月¥1,000割引）',
      'お知り合いのお店をご紹介で、さらに1ヶ月無料。',
    ],
  },

  // 5-6. 補助金
  subsidy: {
    title: '導入費用、補助金が使えるかもしれません。',
    items: [
      'IT導入補助金（デジタル化ツール導入の支援）',
      '食品ロス削減等の各種支援事業',
      '御殿場市商工会のDX支援との連携も可能',
    ],
    close: '申請のご相談も承ります。まずはお問い合わせください。',
  },

  // 5-7. 導入の流れ
  steps: {
    title: '導入はかんたん、3ステップ。',
    items: [
      { no: '①', title: 'ご相談（オンライン or 訪問）', body: 'お店の状況をお聞きします' },
      { no: '②', title: 'デモ（5分）', body: '実際の画面で機能をご覧いただきます' },
      { no: '③', title: '即日導入', body: 'QRコードを置くだけ。その日から使えます' },
    ],
  },

  // 5-8. 想定効果
  effect: {
    title: '想定される効果',
    modelLabel: '御殿場のベーカリーの場合（想定モデル）:',
    lines: [
      '閉店前の廃棄率 20% → 5% に。',
      '月 約2.5万円の廃棄コストが、売上に変わる試算です。',
    ],
    disclaimer: '※ 実際の導入事例は順次公開予定です。',
  },

  // 5-9. FAQ
  faq: {
    title: 'よくあるご質問',
    items: [
      {
        q: '設定はむずかしいですか？',
        a: '駆け込みセールは最初に1回設定するだけ。あとは自動で割引が始まり、終わります。',
      },
      {
        q: 'いまのレジやPOSと一緒に使えますか？',
        a: 'QRakuはQRコードを置くだけで始められます。Square・PayPay・クレジットカード決済に対応しています。',
      },
      {
        q: '途中でやめられますか？',
        a: 'はい。契約期間の縛りはありません。',
      },
      {
        q: '外国語メニューは自分で翻訳しないとダメ？',
        a: '自動で多言語ページが生成されます。日本語で登録すれば、英語・韓国語・中国語にも対応します。',
      },
    ],
  },

  // 5-10. 최종 CTA + 폼
  contact: {
    title: 'まずは、お気軽にご相談ください。',
    sub: '5分のオンラインデモ、またはお店までお伺いします。',
    form: {
      storeName: 'お店の名前',
      contactName: 'お名前',
      contact: '電話 または メール',
      businessType: '業態',
      businessTypeOptions: ['カフェ', 'ベーカリー', '飲食店', 'その他'],
      businessTypePlaceholder: '選択してください',
      message: 'ご相談内容',
      preferredContact: '希望連絡方法',
      preferredOptions: ['電話', 'メール', '訪問'],
      submit: '無料で相談する',
      submitting: '送信中…',
      required: '必須',
      errorRequired: '店舗名・お名前・ご連絡先は必須です。',
      errorGeneric: '送信に失敗しました。時間をおいて再度お試しください。',
    },
  },

  // /owner/thanks
  thanks: {
    title: 'お問い合わせ、ありがとうございます。',
    desc: '担当者より、2〜3営業日以内にご連絡いたします。\nお急ぎの場合はお電話でもお気軽にどうぞ。',
    tryFree: '14日間 無料で試す',
    backHome: 'トップへ戻る',
  },

  // SEO
  seo: {
    title: '飲食店向けQR注文・食品ロス対策 | QRaku Local（御殿場）',
    description: '御殿場のカフェ・飲食店向けQR注文サービス。閉店前の廃棄を「駆け込みセール」で売上に。多言語メニューと近隣発見も。最初の50店舗は初年度無料、IT導入補助金の相談も可能です。',
  },
}

export const ownerLpT = {
  ja,
  en: null, // 후속 카드에서 채움 — 현재 ja 폴백
  ko: null, // 후속 카드에서 채움 — 현재 ja 폴백
}

export function getOwnerLpCopy(lang) {
  return ownerLpT[lang] || ownerLpT.ja
}
