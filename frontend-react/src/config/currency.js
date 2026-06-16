// 통화 표시/변환 — 백엔드 utils/currency.py 와 동일 규약(금액은 '최소단위 정수').
// 백엔드 GET /api/stores 가 내려주는 currency_symbol/currency_decimals 를 받아 동작한다.
// 손님 측은 CurrencyContext(useCurrency)로, admin 측은 currencyHelpers(storeData)로 사용.

export function currencyHelpers(meta = {}) {
    const symbol = meta?.currency_symbol || '¥'
    const rawDec = meta?.currency_decimals
    const decimals = Number.isInteger(rawDec) ? Math.min(3, Math.max(0, rawDec)) : 0
    const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
    return {
        symbol,
        decimals,
        // 최소단위 정수 → 표시 문자열 (1000 → ¥1,000 / £10.00)
        fmt: (minor) =>
            `${symbol}${(safe(minor) / Math.pow(10, decimals)).toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            })}`,
        // 최소단위 정수 → major 단위 소수 문자열 (Square/입력값용)
        toMajorString: (minor) => (safe(minor) / Math.pow(10, decimals)).toFixed(decimals),
        // major 단위 입력(예: "10.00") → 최소단위 정수 (10.00 → 1000)
        toMinorUnits: (major) => Math.round(safe(major) * Math.pow(10, decimals)),
    }
}
