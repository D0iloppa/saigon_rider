# BACKPORT 원장

`core/`가 업스트림 FactMind(`site/*.py`)에서 바뀐 점을 기록하는 **append-only** 원장이다. 항목은 지우거나 고치지 않고 아래에 추가한다(상태 필드 `Forwarded`·`Verified`만 갱신 가능).
core를 바꾸는 커밋마다 항목 1개를 쓴다. 필드:
- `Kind`: `code`(코드 변경) | `learning`(측정에서 배운 것 — 증거 링크 필수) | `no-backport`(역이식 불필요)
- `Why`: 변경 이유와 증거 · `How-to-apply-upstream`: 업스트림에 적용하는 방법
- `Forwarded`: `pending` | `applied <업스트림 커밋>` | `not-needed <사유>` · `Verified`: `no` | `yes <패리티 run id>` (`tools/fm_parity.py`가 출력한 run id만)

---

Id: BP-0001
Date: 2026-10-08
Kind: code
Files: core/fetch.py core/site_report.py core/access.py core/bundle.py core/verify.py core/indexnow.py core/bots.py core/locale/* ← site/public_delivery.py site/site_report.py site/self_service.py site/observation_collect.py site/observation_policy.json (upstream f6b1772)
Why: 초기 이식 — 시장·로캘 특이값(문구·BOTS·UA·국가·통화·요일·정책)을 기본값=업스트림인 파라미터로 분리. 동작 변경 없음.
How-to-apply-upstream: 로캘 파라미터화는 업스트림에 적용할 가치가 있음(ko-KR 기본값이라 업스트림 동작 불변) — 패리티 픽스처 생성 후(P2-B) 적용 여부 결정.
Forwarded: not-needed 업스트림은 단일 로캘(ko-KR) 서비스라 파라미터화를 밀어넣을 이유가 없음 — 패리티 계약(ko-KR 기본값 = 업스트림 동일)이 있어 필요해지면 factmind-saigon/core를 복사해 채택
Verified: yes 20261008-14e5b934

---

Id: BP-0002
Date: 2026-10-08
Kind: code
Files: core/fetch.py PageFacts.handle_starttag ← site/public_delivery.py:114
Why: HTMLParser는 값 없는 속성(`<meta name>`, `<link rel>`)의 값을 None으로 준다. `d.get('rel', '').lower()`가 AttributeError를 내고 호출부(`except (OSError, ValueError)`)가 못 잡아 진단 API가 500이 된다. push 전 코드 리뷰에서 발견. 업스트림에도 같은 버그가 있다.
How-to-apply-upstream: site/public_delivery.py의 같은 함수 첫 줄 `d = dict(attrs)`를 `d = {k: (v or '') for k, v in attrs}`로 치환.
Forwarded: applied bd13494
Verified: yes 20261008-14e5b934

---

Id: BP-0003
Date: 2026-10-08
Kind: no-backport
Files: core/bundle.py questions()
Why: 이식 과정에서 `T = _locale.get(locale)['TEXTS']`가 docstring 앞에 끼어들어 docstring이 죽은 문자열식이 됐다. 위치 오류 교정(업스트림 순서로 복원)이며 업스트림엔 해당 없음.
How-to-apply-upstream: 없음.
Forwarded: not-needed port-only
Verified: yes 20261008-14e5b934

---

Id: BP-0004
Date: 2026-10-13
Kind: no-backport
Files: core/bundle.py list_page directory_page, core/locale/{ko,en,vi}.py (list_summary, list_features_label, list_address_label, list_website_label, directory_section_count, directory_total, list_order_note, list_description_tail) ← site/public_delivery.py:293-345 (upstream d6c8a1e)
Why: forward sync from upstream f6b1772..d6c8a1e (docs d9afca5/f7b446d: Google judged bare-name list pages Soft 404; accepted after owner-approved facts were added). Lists show intro/features/address/official site, a count + last-updated sentence, ItemList description; directory shows per-list counts and intros; "순서는 판매하지 않습니다" copy dropped. ko-KR output is byte-identical to upstream (checked with sample entries). fetch/access/verify/indexnow ranges did not change (file-level upstream-ahead only). self_service.py/build.py/release.py changes are upstream service layer — mirrored in saigon/ adapter, not core.
How-to-apply-upstream: 없음 (업스트림 변경을 가져온 것).
Forwarded: not-needed forward sync from upstream
Verified: yes 20261013-51e95515

---

Id: BP-0005
Date: 2026-10-13
Kind: no-backport
Files: core/locale/en.py (list_summary, directory_section_count, directory_total)
Why: BP-0004에서 들어온 영어 문구가 "1 places", "The 1 lists"처럼 단수에서 어색했다. 복수형 로직 없이 1·N 모두 읽히는 count-neutral 문구로 교체. en은 saigon 전용 로캘이라 업스트림(ko-KR 단일 로캘)에 대응물이 없다. ko.py·core/bundle.py 불변.
How-to-apply-upstream: 없음.
Forwarded: not-needed saigon-only locale
Verified: no
