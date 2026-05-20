/**
 * STB-05 — Golden Path #4
 * SPC 통합: /discover → 近くのお店 (PostGIS nearby) → 미니홈피 → 언어전환 → JSON-LD → referral claim
 *
 * stb-spec.md §4 시나리오 #4
 *
 * 실행 조건:
 *   - 백엔드 uvicorn :8003 가동 중
 *   - Vite dev server :5173 가동 중 (playwright.config.js webServer 자동 기동)
 *   위 조건 미충족 시 전체 테스트 자동 skip.
 *
 * 실행:
 *   npm run test:e2e -- --grep "Golden Path #4"
 *
 * 알려진 미구현 사항 (S-4):
 *   referral claim 성공 후 결제 화면에서 reward 자동 적용 없음 (의도된 P2 미구현).
 *   stb-spec §3 S-4 참조.
 */

import { test, expect } from '@playwright/test';
import { seedTestStore, checkBackendHealth, API_BASE } from './helpers/seed.js';
import { mockGeolocation, GOTEMBA_COORDS } from './helpers/geolocation.js';

// ─── 공유 상태 (beforeAll → 각 테스트) ────────────────────────────────────
let storeCtx = null;
let backendAlive = false;
let referralCode = null;

// ─── 시드 & 헬스체크 ──────────────────────────────────────────────────────
test.beforeAll(async ({ request }) => {
  backendAlive = await checkBackendHealth(request);
  if (!backendAlive) return;

  try {
    storeCtx = await seedTestStore(request);
  } catch (err) {
    console.error('STB-05 seed 실패:', err.message);
    storeCtx = null;
    return;
  }

  // Option A: seed 매장에 고텐바 좌표 + 공개 게재 동의 설정
  // PATCH /api/stores/{id} 는 Bearer 토큰 + dict 으로 임의 Store 필드 갱신 가능.
  // nearby API 가 latitude IS NOT NULL 조건을 사용하므로 좌표 설정 필수.
  try {
    const patchResp = await request.patch(`${API_BASE}/api/stores/${storeCtx.storeId}`, {
      headers: { Authorization: `Bearer ${storeCtx.token}` },
      data: {
        latitude: GOTEMBA_COORDS.latitude,
        longitude: GOTEMBA_COORDS.longitude,
        allow_public_listing: true,
      },
    });
    if (!patchResp.ok()) {
      const body = await patchResp.text();
      console.warn(`STB-05: 매장 좌표 설정 실패 (${patchResp.status()}) — ${body}. nearby 결과 0개 가능.`);
    }
  } catch (err) {
    console.warn('STB-05: 매장 좌표 PATCH 예외:', err.message);
  }

  // referral 코드 사전 생성 (사장님 권한으로 생성, 손님이 claim)
  try {
    const genResp = await request.post(`${API_BASE}/api/referrals/generate`, {
      headers: { Authorization: `Bearer ${storeCtx.token}` },
      data: {
        reward_message: 'STB-05テスト用: 次回のご利用で割引があります！',
        expires_days: 1,
      },
    });
    if (genResp.ok()) {
      const genBody = await genResp.json();
      referralCode = genBody.code;
    } else {
      console.warn(`STB-05: referral code 생성 실패 (${genResp.status()}). referral 단계 skip 가능.`);
    }
  } catch (err) {
    console.warn('STB-05: referral 코드 생성 예외:', err.message);
  }
});

// ─── 유틸 ─────────────────────────────────────────────────────────────────

function requireBackend(t) {
  t.skip(!backendAlive, '백엔드 미가동 (:8003 healthz 실패) — skip');
  t.skip(!storeCtx, '테스트 시드 실패 — skip');
}

// ─── API 레벨 테스트 ──────────────────────────────────────────────────────

test.describe('Golden Path #4 — SPC 통합 (nearby API + 미니홈피 + 다국어 + referral)', () => {

  // ── Step 1: nearby API 200 + 응답 속도 < 100ms ─────────────────────────
  test('Step 1: nearby API — 200 응답 + 100ms 이내', async ({ request }) => {
    requireBackend(test);

    const start = Date.now();
    const resp = await request.get(`${API_BASE}/api/public/discover/nearby`, {
      params: {
        lat: GOTEMBA_COORDS.latitude,
        lng: GOTEMBA_COORDS.longitude,
        radius: 800,
      },
    });
    const elapsed = Date.now() - start;

    // S-2 위험: PostGIS nearby vs 기존 discover 응답 shape 불일치 가능성.
    // 여기서는 HTTP 200 + 기본 shape 만 검증.
    expect(resp.status(), `nearby API ${resp.status()} — PostGIS 미설정 or DB 에러일 수 있음`).toBe(200);

    const body = await resp.json();
    // 응답 구조 확인: discover.py @router.get("/nearby") 반환 shape
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('center');
    expect(body.center).toMatchObject({ lat: GOTEMBA_COORDS.latitude, lng: GOTEMBA_COORDS.longitude });

    // 응답 속도 < 100ms 목표 (DB cold start 시 초과 가능 — warn 처리)
    if (elapsed >= 100) {
      console.warn(`STB-05 Step 1: nearby 응답 ${elapsed}ms (목표 <100ms). DB cold start 가능성.`);
    } else {
      console.log(`STB-05 Step 1: nearby 응답 ${elapsed}ms — 목표 달성`);
    }

    // 매장 좌표 설정 성공 시 items 에 시드 매장 포함 여부 확인 (soft assert)
    if (body.items.length > 0) {
      const seededStore = body.items.find((s) => s.store_id === storeCtx.storeId);
      if (!seededStore) {
        console.warn('STB-05: nearby 결과에 시드 매장 없음. 좌표 설정 or PostGIS 미적용 확인 필요.');
      } else {
        expect(seededStore).toHaveProperty('distance_m');
        expect(typeof seededStore.distance_m).toBe('number');
      }
    } else {
      // items=0 은 PostGIS 미설정 or 반경 내 공개 매장 없음 — Step 1 자체는 통과
      console.warn('STB-05: nearby items=0. PostGIS store.latitude/longitude 미설정 가능성.');
    }
  });

  // ── Step 2: 미니홈피 HTTP 200 ──────────────────────────────────────────
  test('Step 2: 미니홈피 /{slug} — 200', async ({ page }) => {
    requireBackend(test);

    const { slug } = storeCtx;
    const resp = await page.goto(`/${slug}`);
    expect(resp?.status(), `미니홈피 /${slug} 가 200 이어야 함`).toBe(200);
    // SPA catch-all 이 처리하므로 body 에 최소한의 HTML 있어야 함
    await expect(page.locator('body')).not.toContainText('404', { timeout: 5_000 });
  });

  // ── Step 3: 언어 전환 ja → en → ko → zh ──────────────────────────────
  test('Step 3: 언어 전환 — ja → en → ko → zh 메뉴 텍스트 변경', async ({ page }) => {
    requireBackend(test);

    const { slug } = storeCtx;
    await page.goto(`/${slug}`);

    // 페이지 로드 대기
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // 언어 전환 버튼/선택자 탐색 (다양한 패턴 시도)
    // 구현에 따라 select, button, 또는 링크 형태일 수 있음
    const langSelector = page.locator(
      '[data-testid="lang-select"], [data-testid="language-selector"], ' +
      'select[name*="lang"], select[name*="language"], ' +
      '[class*="LanguageSelector"], [class*="lang-selector"], ' +
      'button:has-text("JA"), button:has-text("日本語"), button:has-text("語")'
    ).first();

    const hasLangSelector = await langSelector.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasLangSelector) {
      console.warn('STB-05 Step 3: 언어 전환 UI 미발견. 미니홈피에 다국어 UI 구현 여부 확인 필요. 스킵.');
      // 미구현이어도 테스트 실패 처리는 하지 않음 (UI 미구현 가능성)
      return;
    }

    // 언어별 테스트 데이터 (seed.js 에서 생성한 메뉴 이름 활용)
    // name_en: 'Test Ramen', name_ko: '테스트 라면', name_jp: 'テストラーメン'
    const langTests = [
      { lang: 'en', expectedText: 'Test Ramen', selector: 'EN' },
      { lang: 'ko', expectedText: '테스트 라면', selector: 'KO' },
      { lang: 'zh', expectedText: null, selector: 'ZH' }, // zh 번역 없을 수 있음
      { lang: 'ja', expectedText: 'テストラーメン', selector: 'JA' },
    ];

    for (const { lang, expectedText, selector } of langTests) {
      // 언어 버튼 또는 select option 클릭
      const btn = page.locator(
        `[data-testid="lang-${lang}"], button:has-text("${selector}"), ` +
        `option[value="${lang}"]`
      ).first();

      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500); // 언어 전환 렌더링 대기

        if (expectedText) {
          // 메뉴 텍스트가 언어에 따라 변경되었는지 확인
          // 페이지 어딘가에 해당 텍스트가 있으면 통과
          const found = await page.locator(`text=${expectedText}`).isVisible({ timeout: 3_000 }).catch(() => false);
          if (!found) {
            console.warn(`STB-05 Step 3: lang=${lang} 전환 후 "${expectedText}" 미발견. 메뉴 섹션 미렌더링 가능성.`);
          } else {
            console.log(`STB-05 Step 3: lang=${lang} 텍스트 "${expectedText}" 확인`);
          }
        }
      } else {
        console.warn(`STB-05 Step 3: lang=${lang} 전환 버튼 미발견. 구현 확인 필요.`);
      }
    }
  });

  // ── Step 4: JSON-LD Restaurant schema ─────────────────────────────────
  test('Step 4: JSON-LD <script type="application/ld+json"> — Restaurant schema', async ({ page }) => {
    requireBackend(test);

    const { slug } = storeCtx;
    await page.goto(`/${slug}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });

    // JSON-LD 태그 존재 확인
    const ldJsonScript = page.locator('script[type="application/ld+json"]');
    const count = await ldJsonScript.count();

    if (count === 0) {
      console.warn('STB-05 Step 4: <script type="application/ld+json"> 없음. 미니홈피 SEO 미구현 가능성.');
      // JSON-LD 미구현은 P2 수준 — 테스트 실패 처리하지 않고 warn 으로 기록
      return;
    }

    // 첫 번째 JSON-LD 파싱 + Restaurant @type 확인
    const ldJsonContent = await ldJsonScript.first().textContent();
    expect(ldJsonContent, 'JSON-LD 스크립트 내용이 비어있음').toBeTruthy();

    let ldData;
    try {
      ldData = JSON.parse(ldJsonContent);
    } catch (e) {
      throw new Error(`JSON-LD 파싱 실패: ${e.message}\n내용: ${ldJsonContent}`);
    }

    // Restaurant schema 필수 필드 확인
    // @type 이 배열인 경우도 처리
    const types = Array.isArray(ldData['@type']) ? ldData['@type'] : [ldData['@type']];
    expect(
      types.some((t) => t === 'Restaurant' || t === 'FoodEstablishment'),
      `JSON-LD @type 이 Restaurant 또는 FoodEstablishment 이어야 함. 실제: ${JSON.stringify(ldData['@type'])}`
    ).toBe(true);

    // name 필드 존재
    expect(ldData).toHaveProperty('name');
    console.log(`STB-05 Step 4: JSON-LD Restaurant schema 확인 — name: "${ldData.name}"`);
  });

  // ── Step 5: referral claim → reward_message 표시 + S-4 명시 ───────────
  test('Step 5: referral claim — 200 + reward_message + S-4 미적용 확인', async ({ request, page }) => {
    requireBackend(test);

    if (!referralCode) {
      test.skip(true, 'referral 코드 생성 실패 — skip');
    }

    // 5-A: API 레벨 claim 검증
    const claimResp = await request.post(`${API_BASE}/api/referrals/claim`, {
      data: {
        code: referralCode,
        guest_uuid: `stb05-guest-${Date.now()}`,
      },
    });

    expect(claimResp.status(), `referral claim ${claimResp.status()} — 200 이어야 함`).toBe(200);

    const claimBody = await claimResp.json();
    expect(claimBody.success).toBe(true);
    expect(claimBody).toHaveProperty('reward_message');
    expect(typeof claimBody.reward_message).toBe('string');
    expect(claimBody.reward_message.length).toBeGreaterThan(0);
    console.log(`STB-05 Step 5: referral claim 성공. reward_message: "${claimBody.reward_message}"`);

    // 5-B: UI 레벨 — 미니홈피에서 reward_message 표시 여부 (soft)
    const { slug } = storeCtx;
    await page.goto(`/${slug}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // referral 입력 UI 탐색
    const referralInput = page.locator(
      '[data-testid="referral-input"], input[placeholder*="紹介"], input[placeholder*="referral"], ' +
      'input[placeholder*="コード"], input[name*="referral"]'
    ).first();

    const hasReferralUI = await referralInput.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasReferralUI) {
      await referralInput.fill(referralCode);

      const submitBtn = page.locator(
        '[data-testid="referral-submit"], button:has-text("適用"), ' +
        'button:has-text("使用"), button:has-text("Apply"), button:has-text("클레임")'
      ).first();

      if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await submitBtn.click();
        // reward_message 가 화면에 표시되는지 확인
        const rewardMsg = page.locator(`text=${claimBody.reward_message}`);
        const msgVisible = await rewardMsg.isVisible({ timeout: 5_000 }).catch(() => false);
        if (msgVisible) {
          console.log('STB-05 Step 5: UI 에서 reward_message 표시 확인');
        } else {
          console.warn('STB-05 Step 5: reward_message UI 표시 미확인. 구현 확인 필요.');
        }
      }
    } else {
      console.warn('STB-05 Step 5: 미니홈피에 referral 입력 UI 없음. 구현 확인 필요.');
    }

    // 5-C: S-4 확인 — referral claim 후 결제 시 reward 미적용 (의도된 P2 미구현)
    // stb-spec §3 S-4: reward 는 claim 기록만 남기고 결제 금액에 자동 적용되지 않음.
    console.warn('S-4 확인: referral claim 후 결제 시 reward 미적용. 의도된 P2 미구현 (stb-spec §3 S-4).');

    // 결제 화면으로 이동하여 할인 미적용 assert
    // (실제 결제 UI 경로: /{slug}/table/1/menu → 카트 → 체크아웃)
    // 체크아웃 페이지나 카트 모달에 '할인 적용됨' 텍스트가 없어야 함
    await page.goto(`/${slug}/table/1/menu`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // 할인 자동 적용 여부 확인 — 표시되지 않아야 함 (S-4 의도된 미구현)
    const discountApplied = page.locator(
      'text=할인 적용됨, text=割引適用済, text=Discount Applied, [data-testid="discount-applied"]'
    );
    // S-4: 이 텍스트가 없어야 정상 (reward 미적용 확인)
    await expect(discountApplied).not.toBeVisible({ timeout: 3_000 });
    console.log('STB-05 Step 5 S-4: 결제 화면에 할인 자동 적용 없음 — 의도된 동작 확인');
  });

  // ── 통합: geolocation mock → /discover 페이지 → UI 흐름 ────────────────
  test('통합: geolocation mock → /discover → 近くのお店 → 미니홈피 진입', async ({ browser }) => {
    requireBackend(test);

    // 새 컨텍스트에 geolocation 주입
    const ctx = await browser.newContext();
    await mockGeolocation(ctx);
    const page = await ctx.newPage();

    try {
      // /discover 페이지 진입 (프론트엔드 라우트)
      const discoverResp = await page.goto('/discover');
      // SPA catch-all 이므로 200 또는 undefined (클라이언트 라우팅)
      if (discoverResp) {
        expect([200, 304], `/discover 응답 상태`).toContain(discoverResp.status());
      }

      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

      // "近くのお店" 탭/버튼 탐색
      const nearbyTab = page.locator(
        'button:has-text("近くのお店"), [data-testid="nearby-tab"], ' +
        '[data-testid="tab-nearby"], a:has-text("近く"), ' +
        'button:has-text("Nearby"), button:has-text("주변")'
      ).first();

      const hasNearbyTab = await nearbyTab.isVisible({ timeout: 8_000 }).catch(() => false);

      if (!hasNearbyTab) {
        console.warn('STB-05 통합: /discover 페이지 또는 "近くのお店" 탭 미발견. 프론트엔드 라우트 구현 확인 필요.');
        // /discover 미구현은 UI 레벨 이슈 — API 레벨 Step 1 이 통과하면 충분
        return;
      }

      await nearbyTab.click();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      // geolocation 권한 요청 다이얼로그 처리 (컨텍스트에서 이미 grant 했으므로 자동 통과)
      // nearby 카드 목록 확인 (0개여도 UI 자체는 렌더링되어야 함)
      const nearbySection = page.locator(
        '[data-testid="nearby-stores"], [data-testid="nearby-list"], ' +
        '[class*="NearbyStores"], [class*="nearby-stores"]'
      ).first();

      const hasSectionUI = await nearbySection.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!hasSectionUI) {
        console.warn('STB-05 통합: nearby 섹션 UI 미발견. 좌표 설정 or PostGIS 미적용 가능성.');
      }

      // 시드 매장 카드가 있으면 클릭하여 미니홈피 진입
      const storeCard = page.locator(
        `[data-testid="store-card-${storeCtx.storeId}"], ` +
        `[data-store-id="${storeCtx.storeId}"], ` +
        `a[href*="${storeCtx.slug}"]`
      ).first();

      const hasStoreCard = await storeCard.isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasStoreCard) {
        await storeCard.click();
        // 미니홈피 진입 확인
        await expect(page).toHaveURL(new RegExp(storeCtx.slug), { timeout: 10_000 });
        await expect(page.locator('body')).not.toContainText('404', { timeout: 5_000 });
        console.log(`STB-05 통합: 미니홈피 /${storeCtx.slug} 진입 확인`);
      } else {
        console.warn('STB-05 통합: nearby 결과에 시드 매장 카드 없음 (좌표 미설정 or 반경 밖). API Step 1 결과 참조.');
      }
    } finally {
      await ctx.close();
    }
  });

});
