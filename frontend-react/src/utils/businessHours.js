/**
 * 매장의 영업시간 + is_open 토글을 종합해 현재 영업 중인지 계산.
 *
 * Store.business_hours JSON 형식:
 *   { "monday": { "open": "11:00", "close": "22:00", "closed": false }, ... }
 * Store.is_open: 사장님 수동 토글 (false면 영업시간이라도 강제로 닫힘)
 *
 * 자정 넘는 영업시간(예: 18:00 ~ 02:00) 처리 포함.
 */

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseHHMM(str) {
    if (!str || typeof str !== 'string') return null
    const [h, m] = str.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return h * 60 + m
}

function safeParse(json) {
    if (!json) return null
    if (typeof json !== 'string') return json
    try { return JSON.parse(json) } catch { return null }
}

/**
 * 현재 영업 중인지 판정.
 * @returns {{ open: boolean, reason: 'manual_off' | 'no_schedule_today' | 'before_open' | 'after_close' | 'open' | 'no_data' }}
 */
export function computeStoreStatus(store, now = new Date()) {
    if (!store) return { open: false, reason: 'no_data' }

    // 1. 사장님 수동 토글 우선
    if (store.is_open === false) return { open: false, reason: 'manual_off' }

    const hours = safeParse(store.business_hours)
    if (!hours) return { open: true, reason: 'open' }   // 영업시간 미설정 → 항상 열림

    const dayKey = DAY_NAMES[now.getDay()]
    const today = hours[dayKey]
    // ⚠️ 정기휴일(closed)은 차단 안 함 — 일본 식당은 휴일에도 영업하는 경우 많음.
    //   사장님이 진짜 닫고 싶으면 register 의 "営業終了" 버튼 (is_open=false) 사용.
    if (!today || !today.open) {
        return { open: true, reason: 'open' }   // 시간 정보 없으면 열림 처리
    }

    const nowMin = now.getHours() * 60 + now.getMinutes()
    const openMin = parseHHMM(today.open)
    const closeMin = parseHHMM(today.close)
    if (openMin === null || closeMin === null) {
        return { open: true, reason: 'open' }   // 형식 오류 → 안전하게 열림 처리
    }

    // 자정 넘김 (예: 18:00 ~ 02:00)
    if (closeMin <= openMin) {
        const isOpen = nowMin >= openMin || nowMin <= closeMin
        return { open: isOpen, reason: isOpen ? 'open' : (nowMin < openMin ? 'before_open' : 'after_close') }
    }

    if (nowMin < openMin) return { open: false, reason: 'before_open' }
    if (nowMin > closeMin) return { open: false, reason: 'after_close' }
    return { open: true, reason: 'open' }
}

/** 단순 boolean 헬퍼 */
export function isStoreOpenNow(store, now = new Date()) {
    return computeStoreStatus(store, now).open
}
