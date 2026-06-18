// 업종(Store.category)별 표시 용어 매핑.
// 표시 라벨에만 적용 — 데이터/주문/결제 플로우는 동일하다(통화 currencyHelpers 와 유사한 경량 헬퍼).
const TERMS = {
  HOTEL: {
    unit: '客室', unitEn: 'Room',
    order: 'ルームサービス', orderEn: 'Room Service',
    callStaff: 'スタッフに連絡',
  },
  DEFAULT: {
    unit: 'テーブル', unitEn: 'Table',
    order: '注文', orderEn: 'Order',
    callStaff: 'スタッフ呼出',
  },
}

// category(예: 'HOTEL') → 용어 객체. 미지/누락은 DEFAULT.
export function termsOf(category) {
  return TERMS[category] || TERMS.DEFAULT
}
