# UUID 기반 게스트 트래킹 기능 구현 결과

요청하신 "경쟁사와의 차별화를 위한 회원가입 없는 단골 식별 (UUID 기반 게스트 트래킹)" 기능 구현을 다음과 같이 프론트엔드와 백엔드에 모두 적용 완료했습니다.

## 1. 프론트엔드 (UUID 생성 및 보관)
- **적용 위치**: `frontend-react/src/App.jsx`
- **변경 사항**: 앱이 실행될 때 가장 먼저 `localStorage`를 검사하여 `guest_uuid` 값이 있는지 확인합니다. 만약 값이 존재하지 않으면 `crypto.randomUUID()` API를 통해 새로운 고유 식별자를 생성하여 브라우저의 로컬 스토리지에 영구적으로 보관하도록 구현했습니다.

## 2. 주문 연동 (데이터 수집)
- **적용 위치**: `frontend-react/src/views/OrderView.jsx` (주문 처리 로직)
- **변경 사항**: 사용자가 장바구니에 담은 메뉴를 최종적으로 결제/주문(checkout)할 때, 백엔드로 전송하는 `orderPayload`에 `localStorage.getItem('guest_uuid')` 값을 추가하여 함께 전송하도록 수정했습니다. 

## 3. 백엔드 (Shadow Profile 구축)
- **적용 위치**: `backend/models.py` 및 `backend/routers/orders.py`
- **변경 사항**:
  - `models.py`에 새로운 `GuestProfile` 데이터베이스 스키마를 추가하여 UUID별 방문 횟수(`visit_count`), 마지막 방문일(`last_visit`), 선호 언어(`preferred_language`)를 저장할 수 있도록 했습니다.
  - 기존 `Order` 모델에도 `guest_uuid` 필드를 추가했습니다.
  - `orders.py`의 `create_order` API에서 주문이 들어올 때마다 전달받은 `guest_uuid`를 `Order` 테이블에 함께 기록합니다. 또한 `GuestProfile` 테이블을 조회하여 처음 방문한 UUID이면 새 프로필을 생성하고, 기존 UUID이면 방문 횟수(`visit_count`)를 1 증가시키고 마지막 방문 일시를 업데이트하도록 구현했습니다.

## 4. UX 적용 (언어 설정 기반 스마트 연동)
- **적용 위치**: `backend/routers/guests.py` 및 `frontend-react/src/context/LanguageContext.jsx`
- **변경 사항**:
  - 백엔드에 게스트 관련 전용 API(`GET /api/guests/{uuid}` 및 `PUT /api/guests/{uuid}/language`)를 신규 개발하여 `main.py` 라우터에 등록했습니다.
  - 프론트엔드의 전역 언어 상태를 관리하는 `LanguageContext`에서 애플리케이션 초기 로딩 시 백엔드 API를 호출해 이전에 저장된 선호 언어가 있다면 이를 자동으로 불러와 화면에 적용합니다.
  - 사용자가 앱 내에서 언어를 변경할 때마다 비동기적으로 백엔드 API를 호출해 `GuestProfile`의 `preferred_language` 필드를 즉각적으로 최신화합니다. 이를 통해 재방문 시 별도의 조작 없이 이전의 언어로 자동 맞춤 설정됩니다.
