# ADR-005 단기 JWT WebSocket 인증 토큰

**상태**: Accepted (2026-05-10)
**관련 카드**: WS-03, WS-04

## 결정

WebSocket 연결은 쿼리 파라미터의 **단기 토큰**으로 인증한다.
- 토큰 발급 엔드포인트: `POST /api/ws/token/{audience}` (admin / staff / customer 분기).
- 발급 시 기존 인증 (admin JWT / staff JWT / 매장+테이블) 검증 후 랜덤 토큰 생성.
- 토큰을 Redis 에 `ws:token:{token}` 키로 저장 (`{store_id, audience, table_number, exp}`), TTL = `WS_AUTH_TOKEN_TTL_SECONDS` (기본 300초).
- WS 엔드포인트 (`/ws/{audience}/{store_id}?token=...`) 가 첫 핸드셰이크 시 토큰 검증 → 부적합 시 `1008` close.

## 이유

- **표준 HTTP 헤더 불가**: 브라우저 WebSocket API 는 connect 시 임의 헤더 추가 불가 → 쿼리/path 외 인증 수단이 사실상 없음.
- **장수명 토큰 노출 위험**: 일반 JWT (수시간 ~ 수일) 를 URL 에 넣으면 referer / 로그에 흘러 위험. 단기(5분) 로 노출 영향 최소화.
- **발급은 인증된 HTTPS 채널**: 토큰 발급 자체는 일반 인증을 통과한 HTTP POST 로 안전.
- **Redis 기반 즉시 폐기 가능**: 의심 토큰은 `DEL` 한 번으로 무효화.

## 대안

- **쿠키 인증 (sec-fetch / SameSite)**: 같은 도메인일 땐 가능하나 cross-origin 운영 / 멀티 매장 / iframe 등에서 복잡.
- **첫 메시지로 인증 (post-connect)**: 핸드셰이크 통과 후 클라이언트가 인증 메시지 전송 → 서버는 인증 전엔 다른 메시지 무시. 구현 복잡도 증가, 초기 메시지 race 처리 필요.
- **장수명 JWT 직접 노출**: 위험.
- **mTLS**: 운영 부담이 너무 크다.

## 결론

단기 토큰 + Redis 저장이 단순·안전.
**미래 분기점**: 토큰 발급 빈도가 너무 잦아 Redis 부담이 커지면 stateless JWT (서명만, 단 짧은 exp) 로 전환 검토. 단, 즉시 폐기 능력을 잃는 trade-off.
