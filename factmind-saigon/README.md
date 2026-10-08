# factmind-saigon

FactMind(`/DEVELOP/Blueurban/factmind`, 이식 기준 커밋 `f6b1772`)의 코어를 사이공라이더용으로 벤더링한 패키지. 계획서: `ai-docs/spec/261008_fm_engine_port_plan.md`.

## 두 층
- `factmind_saigon/core/` — 이식한 순수 모듈 C1~C7 + 로캘. **stdlib만**, `app.*`·sqlalchemy·fastapi·`factmind_saigon.saigon` import 금지. 입출력은 평문 dict. 다른 프로젝트(FactMind 본체 포함)가 폴더째 가져갈 수 있어야 한다.
- `factmind_saigon/saigon/` — 사이공라이더 어댑터(P2-B·P3). 지금은 자리표시자.

## 패리티 계약
시장·로캘 특이값(문구·BOTS·User-Agent·국가·통화·요일·봇 정책·IndexNow 엔진)은 전부 파라미터이고 **기본값은 업스트림 값**이다. 기본 호출(`locale='ko-KR'`)은 업스트림과 같은 결과(번들은 바이트 동일, 진단·판정은 구조 동일; 예외 문구는 `FetchError.code`, 진단은 `reason_code` 추가가 의도된 차이)여야 한다. `core/locale/ko.py`는 업스트림 문자열을 글자 그대로 둔다. 변경 이력은 `BACKPORT.md`.

## VN 데이터 위치
- `core/locale/vi.py`·`en.py`(문구 초안 — 원어민 검수 전, 키 집합은 `ko.py`와 동일해야 함), `core/bot_policy.json`(업스트림 정책에서 Yeti·Daum 제거).
- `core/bot_policy_upstream.json` = 업스트림 `observation_policy.json` 원본(패리티 기본값).
- **[확인 필요]** Cốc Cốc·Zalo 봇의 UA/rDNS는 공식 근거를 확인하기 전까지 정책에 넣지 않았다.

## 파이썬 호환
`requires-python >= 3.8`: 패리티 검증이 업스트림 체크아웃이 있는 호스트(python 3.8)에서 두 타깃을 같은 인터프리터로 돌리므로 core는 3.8에서 import·실행 가능해야 한다(`match`·`X | Y`·`list[str]` 런타임 애노테이션 금지). 컨테이너는 3.12.
