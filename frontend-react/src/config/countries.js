// 가입 폼 국가 선택지 — 백엔드 config/countries.py 의 COUNTRIES 와 동기화한다.
// 국가 추가 시 백엔드 카탈로그와 이 목록을 함께 갱신할 것.
// (중기: GET /api/countries 로 백엔드에서 내려받아 단일 출처화 예정)
export const COUNTRY_OPTIONS = [
    { code: 'JP', label: '日本 (JPY)' },
    { code: 'GB', label: 'United Kingdom (GBP)' },
]
