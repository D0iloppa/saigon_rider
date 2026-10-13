---
# ── 블로그 글 템플릿 (이 파일은 "_"로 시작해 빌드에서 무시된다) ──
# 사용법: content/blog/<lang>/<slug>.md 로 복사 → 아래 값 채우기 → 본문 작성.
#   lang=ko 는 content/blog/ko/, lang=vi 는 content/blog/vi/ 에 둔다. 파일명 = slug + ".md".
# 발행 게이트: status: ready 이고 reviewed_on 이 있어야만 빌드에 나간다. 작성 중엔 draft.
# 같은 주제의 vi·ko 글은 topic_id 를 똑같이 맞춘다(둘 다 ready 면 hreflang 으로 서로 연결).
# "#"로 시작하는 줄은 주석. 이 주석 줄들은 복사 후 지워도 된다.

# 주제 ID — 6개 중 하나(SoT §2.4): used-bike-checklist | ownership-transfer | rainy-season-riding
#   | tsn-airport-parking | safe-neighbor-trade | fuel-cost
topic_id: used-bike-checklist
# URL 조각: 소문자·숫자·하이픈만(악센트 없이). vi 예) mua-xe-may-cu-checklist / ko 예) used-bike-checklist
slug: used-bike-checklist
# vi | ko — 폴더와 같아야 한다
lang: ko
# 검색 결과 제목이 된다. 30~60자, 핵심 검색어를 앞쪽에
title: 호치민에서 중고 오토바이 살 때 체크리스트
# 검색 결과 설명이 된다. 80~160자, 글이 답하는 질문을 한 문장으로
description: 호치민에서 중고 오토바이를 사기 전에 서류·차대번호·엔진·가격을 어떻게 확인하는지 직접 경험을 바탕으로 정리했습니다.
# YYYY-MM-DD. 실제로 발행(ready 전환·배포)하는 날
date_published: 2026-10-20
# 내용을 고친 날. 비워 두면 date_published 와 같다
date_modified:
# 2~5개. 쉼표가 들어간 항목은 "…" 로 감싼다
tags: [중고 오토바이, 호치민, 체크리스트]
# draft(작성 중) | ready(검수 완료, 발행)
status: draft
# 검수 완료일 — 비어 있으면 ready 여도 발행되지 않는다. vi 글은 네이티브 검수자 검수일
reviewed_on:
# 검수자(화면에 표시되지 않음, 기록용)
reviewed_by:
# 참고 자료: URL 만, 또는 "표시 텍스트 | URL". 법·수수료·가격은 반드시 출처를 단다
sources:
- 호치민시 교통국 | https://example.com/replace-me
# ── 본문 규칙 ──
# 600~1,200단어. 제목(h1)은 title 이 쓰이므로 본문에 "# " 를 쓰지 않는다(빌드 오류).
# 지원 문법: ## ### 소제목, 문단, - 목록, 1. 번호 목록, > 인용, --- 구분선, **굵게**, *기울임*, `코드`,
#   [텍스트](https://… 또는 /…). HTML·주석(<!-- -->)은 지원하지 않고 글자로 그대로 보인다.
---

이 글이 누구의 어떤 질문에 답하는지 2~3문장으로 시작한다. 결론(가장 중요한 한 가지)을 먼저 말한다.

## 한눈에 보기

- 핵심 1
- 핵심 2
- 핵심 3

## 1. 첫 번째 확인할 것

구체적인 방법·숫자·장소를 쓴다. 가격·수수료는 "2026-10 기준"처럼 날짜를 붙인다.

## 2. 두 번째 확인할 것

1. 순서가 있는 절차는 번호 목록으로
2. 한 단계에 한 가지 행동
3. 필요한 서류·준비물은 굵게: **등록증(cà vẹt)**

## 3. 자주 하는 실수

> 실제로 겪었거나 들은 사례를 짧게.

## 작성 근거와 경험

이 글을 쓴 사람이 직접 해 본 것, 확인한 날짜, 확인하지 못한 것(한계)을 솔직하게 적는다. 과장·홍보 문구는 쓰지 않는다. 앱 링크는 필요할 때만 1개 이하: [사이공라이더](/ko)

---

마지막 확인일: 2026-10-20
