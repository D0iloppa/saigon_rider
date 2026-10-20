"""사이공라이더 베트남 홍보 — 핵심 가치와 단계적 접근 계획 PDF 빌드 (2026-10-21).

근거 문서: ../261021_vietnam_launch_promotion_analysis.md (조사·판단 원문, §0-A 가 축).
대표 지시(2026-10-21): "돈 내고 광고하자에서 벗어나는 핵심 가치를 찾아라. FactMind 를 활용하거나, 역발상."
한글 = Malgun Gothic, 베트남어 = Segoe UI(Malgun 은 베트남어 확장 라틴 글리프가 없음).
실행: python -X utf8 build_pdf.py
"""
import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import CondPageBreak, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = Path(__file__).resolve().parent
OUT = HERE / 'saigon_rider_vietnam_promotion_staged_plan_2026-10-21.pdf'

NAVY = colors.HexColor('#172B3A')
TEAL = colors.HexColor('#087F82')
ORANGE = colors.HexColor('#D85A27')
MUTED = colors.HexColor('#526777')
LINE = colors.HexColor('#D9E1E6')
PALE = colors.HexColor('#F3F6F8')
STAGE_BG = colors.HexColor('#E6F2F2')
WARN_BG = colors.HexColor('#FDF1EA')
CORE_BG = colors.HexColor('#172B3A')

WIDTH, HEIGHT = A4
MARGIN = 17 * mm
CONTENT = WIDTH - 2 * MARGIN

pdfmetrics.registerFont(TTFont('Malgun', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBold', 'C:/Windows/Fonts/malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunBold', italic='Malgun', boldItalic='MalgunBold')
pdfmetrics.registerFont(TTFont('Segoe', 'C:/Windows/Fonts/segoeui.ttf'))
pdfmetrics.registerFont(TTFont('SegoeBold', 'C:/Windows/Fonts/segoeuib.ttf'))
pdfmetrics.registerFontFamily('Segoe', normal='Segoe', bold='SegoeBold', italic='Segoe', boldItalic='SegoeBold')

S = {
    'title': ParagraphStyle('title', fontName='MalgunBold', fontSize=25, leading=35, textColor=NAVY, spaceAfter=6),
    'subtitle': ParagraphStyle('subtitle', fontName='Malgun', fontSize=12, leading=18.5, textColor=MUTED, spaceAfter=16),
    'h1': ParagraphStyle('h1', fontName='MalgunBold', fontSize=16.5, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=8,
                         keepWithNext=True),
    'h2': ParagraphStyle('h2', fontName='MalgunBold', fontSize=11.8, leading=17.5, textColor=TEAL, spaceBefore=9, spaceAfter=5,
                         keepWithNext=True),
    'body': ParagraphStyle('body', fontName='Malgun', fontSize=9.7, leading=15.3, textColor=NAVY, wordWrap='CJK',
                           spaceAfter=6),
    'bullet': ParagraphStyle('bullet', fontName='Malgun', fontSize=9.7, leading=15, textColor=NAVY, wordWrap='CJK',
                             leftIndent=11, bulletIndent=1, spaceAfter=3),
    'cell': ParagraphStyle('cell', fontName='Malgun', fontSize=8.5, leading=12.6, textColor=NAVY, wordWrap='CJK'),
    'cellb': ParagraphStyle('cellb', fontName='MalgunBold', fontSize=8.5, leading=12.6, textColor=NAVY, wordWrap='CJK'),
    'small': ParagraphStyle('small', fontName='Malgun', fontSize=7.8, leading=11.2, textColor=MUTED, wordWrap='CJK'),
    'head': ParagraphStyle('head', fontName='MalgunBold', fontSize=8.5, leading=12.8, textColor=colors.white, wordWrap='CJK'),
    'eyebrow': ParagraphStyle('eyebrow', fontName='MalgunBold', fontSize=9.5, leading=14, textColor=TEAL, spaceAfter=4),
    'eyebrow_w': ParagraphStyle('eyebrow_w', fontName='MalgunBold', fontSize=9.5, leading=14,
                                textColor=colors.HexColor('#9FD6D6'), spaceAfter=4),
    'core': ParagraphStyle('core', fontName='MalgunBold', fontSize=12.5, leading=20, textColor=colors.white, wordWrap='CJK',
                           spaceAfter=4),
    'core_body': ParagraphStyle('core_body', fontName='Malgun', fontSize=9.6, leading=15, textColor=colors.HexColor('#E3ECF1'),
                                wordWrap='CJK'),
    'stage': ParagraphStyle('stage', fontName='MalgunBold', fontSize=13.5, leading=19, textColor=NAVY, wordWrap='CJK'),
    'stagesub': ParagraphStyle('stagesub', fontName='Malgun', fontSize=9.4, leading=14, textColor=MUTED, wordWrap='CJK'),
    'quote': ParagraphStyle('quote', fontName='MalgunBold', fontSize=11, leading=17, textColor=ORANGE, wordWrap='CJK',
                            spaceBefore=2, spaceAfter=4),
}


import re

# Malgun Gothic 에 없는 글자(베트남어 확장 라틴 U+1EA0~1EF9, ơ ư 등 U+00C0~024F)를 포함한 토큰만 Segoe UI 로 감싼다.
# 토큰 경계 = 공백·한글·태그 문자(<>&;) — 한글과 붙은 "Tốt(범용" 은 "Tốt(" 까지만 감싸 한글이 Segoe(한글 없음)로 가지 않게 한다.
_VI_RUN = re.compile(r'[^\s<>&;가-힣ㄱ-ㆎᄀ-ᇿ]+')


def _needs_segoe(token: str) -> bool:
    return any(0x00C0 <= ord(ch) <= 0x024F or 0x1EA0 <= ord(ch) <= 0x1EF9 for ch in token)


def _wrap_vi(m):
    tok = m.group(0)
    return f'<font name="Segoe">{tok}</font>' if _needs_segoe(tok) else tok


def esc(text: str) -> str:
    """HTML 이스케이프 + <b> 만 마크업으로 허용 + 베트남어 토큰 자동 글꼴 전환."""
    s = html.escape(str(text)).replace('\n', '<br/>')
    s = s.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
    return _VI_RUN.sub(_wrap_vi, s)


def vi(text: str, bold: bool = False) -> str:
    font = 'SegoeBold' if bold else 'Segoe'
    return f'<font name="{font}">{html.escape(str(text))}</font>'


def P(text, style='body'):
    return Paragraph(esc(text), S[style])


def M(markup, style='body'):
    return Paragraph(markup, S[style])


def bullets(items, style='bullet'):
    return [Paragraph(item if item.startswith('<') else esc(item), S[style], bulletText='•') for item in items]


def cellify(x, style='cell'):
    if isinstance(x, Paragraph):
        return x
    return Paragraph(esc(x), S[style])


def table(headers, rows, widths_mm, zebra=True, head_bg=NAVY):
    content = [[Paragraph(esc(h), S['head']) for h in headers]]
    content += [[cellify(c) for c in row] for row in rows]
    t = Table(content, colWidths=[w * mm for w in widths_mm], repeatRows=1, hAlign='LEFT')
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), head_bg),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, head_bg),
        ('LINEBELOW', (0, 1), (-1, -1), 0.3, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    if zebra:
        style.append(('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE]))
    t.setStyle(TableStyle(style))
    return t


def box(flowables, bg=STAGE_BG, border=TEAL):
    t = Table([[flowables]], colWidths=[CONTENT], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 0.8, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Malgun', 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 10 * mm, '사이공라이더 베트남 홍보 — 핵심 가치와 단계적 접근 · 2026-10-21 · 내부 검토용')
    canvas.drawRightString(WIDTH - MARGIN, 10 * mm, f'{doc.page}')
    canvas.restoreState()


def stage_header(num, title, period, goal):
    return box([
        M(f'<font color="#087F82">STAGE {num}</font> &nbsp; {esc(title)}', 'stage'),
        P(f'{period} · 목표: {goal}', 'stagesub'),
    ])


story = []

# ═══════════════════════ 표지 + 한 장 요약 ═══════════════════════
story += [
    Spacer(1, 10 * mm),
    P('SAIGON RIDER · 2026-10-21', 'eyebrow'),
    P('베트남 홍보 — 핵심 가치와 단계적 접근', 'title'),
    P('안드로이드 공개·iOS 심사 중 시점에서, "돈 내고 광고" 대신 무엇을 축으로 알릴지 정리한 문서. '
      '조사 결과(베트남 시장·단가·법규)와 우리가 이미 가진 기술(사이공라이더 앱 + FactMind 노출 엔진)을 묶었다. '
      '작성: Claude(저장소 실측 + 웹 조사). 판단은 §1·§3·§6, 사실은 §4·§5.', 'subtitle'),
    box([
        P('핵심 가치 명제', 'eyebrow_w'),
        P('사이공라이더의 자산은 "앱"이 아니라, 호치민 동네에 대해 아무도 공개하지 않은 사실이다 — '
          '지금 어느 길이 잠겼나 · 이 정비소가 믿을 만한가 · 이 동네에 지금 뭐가 팔리나 · 이 가게가 실제로 있나.', 'core'),
        P('광고는 사람을 사오는 일이고 매달 0으로 리셋된다. 그 사실을 공개 웹페이지로 내보내 Google(베트남 검색 95.6%)과 AI 가 '
          '가져가게 하면, 질문이 우리에게 오고 설치는 그 뒤에 따라온다. FactMind 가 한국에서 만들고 있는 바로 그 기술을 '
          '사이공라이더에 이식한다. 유료 광고는 측정 실험용 소액으로만 남긴다.', 'core_body'),
    ], bg=CORE_BG, border=CORE_BG),
    Spacer(1, 4 * mm),
    P('한 장 요약', 'h1'),
]
story += bullets([
    '<b>노출 엔진이 홍보다.</b> 도로별 침수 현황 · 동×업종 업체 허브 · 업체 페이지 · 매물 허브를 서버 렌더 공개 페이지로 내보내고, '
    'FactMind 의 부품(수집 진단 · 사이트맵 · IndexNow · JSON-LD · AI 인용 관측)을 그대로 붙인다. 지금 앱의 공개 화면은 SPA 셸이라 검색봇·AI 봇이 본문을 읽지 못한다.',
    '<b>알릴 것은 하나다.</b> 10~12월 우기 침수(공공재로 풀어 언론·그룹이 가져다 쓰게) → 1~2월 설(2027-02-06) 전 대청소 중고거래.',
    '<b>사용자 대신 사장을 모객한다.</b> 업체 페이지 = 사장의 무료 Google 존재. 사장이 QR·Zalo 로 자기 페이지를 퍼뜨리는 유통망이 된다.',
    '<b>사람들이 이미 있는 곳에서 유통한다.</b> Facebook 그룹·Zalo 가 유통망, 우리 앱은 도구. 지역은 확정된 푸년–빈탄 5개 동 한 덩어리만.',
    '<b>4단계.</b> Stage 0 기본기(2주) → Stage 1 노출 엔진 가동 + 침수 공공재(6주) → Stage 2 사장 유통망 + 설 중고(5주) → Stage 3 확장. 각 단계는 통과 기준을 넘어야 다음으로.',
    '<b>월 외부 비용 약 1,200만~1,800만 VND(약 66만~100만 원)</b> — 1차 매체 중심안(월 3,700만)의 절반 이하. 대신 개발 시간(공개 웹 레이어 2~3주)이 든다.',
])
story += [
    Spacer(1, 2 * mm),
    P('신뢰도 표기: [공식]=1차 자료·공식 요금표 · [언론]=현지 언론 · [블로그]=대행사 2차 자료(편차 큼) · [저장소]=saigon_rider·factmind 코드·문서 실측 · '
      '[미확인]=찾지 못함. 환율 1 USD 는 약 26,000 VND, 100만 VND 는 약 5.5만 원.', 'small'),
    PageBreak(),
]

# ═══════════════════════ §1 핵심 가치 ═══════════════════════
story += [P('§1. 핵심 가치 — 왜 "광고"가 답이 아닌가', 'h1')]
story.append(table(
    ['', '광고로 사람을 사온다', '노출 자산을 만든다 (채택)'],
    [
        ['비용 성격', '월 지출 → 설치. 멈추면 0. 단가는 경쟁자가 올림', '한 번 만든 페이지가 계속 질문을 받는다. 누적·복리'],
        ['통제', '플랫폼 경매·정책에 종속', '우리 도메인·우리 데이터·우리 서버 — 전부 우리 통제 영역'],
        ['베트남 사실', 'Facebook 설치 광고 CPM 1.8만~3.3만 VND, 설치당 $0.3~0.9 — 싸 보이지만 가입·활성까지 가면 3~4배', 'Google 검색 95.6%(Cốc Cốc 3.6%, Bing 0.4%) · 생성형 AI 사용 26.5%(동남아 2위) — 질문은 전부 Google 과 AI 로 간다'],
        ['첫 화면', '광고로 들어온 사람이 빈 지도를 봄 → 삭제 + 나쁜 리뷰', '질문에 답하는 페이지를 먼저 봄 → 설치는 "더 보려면"'],
        ['우리가 가진 것', '없음(분석 SDK 0, 랜딩 링크 0)', '아무도 공개 안 한 데이터 + FactMind 의 노출 기술·실패 교훈'],
        ['남는 것', '숫자(설치 수)', '색인된 페이지 · 제3자 링크 · AI 인용 — 경쟁자가 돈으로 못 사는 자산'],
    ],
    [24, 72, 78],
))
story += [P('노출은 다섯 관문을 다 통과해야 생긴다 (FactMind 타당성 조사의 틀을 그대로)', 'h2')]
story.append(table(
    ['관문', '뜻', '사이공라이더 현재', '누가 움직이나'],
    [
        ['① 수집', '검색봇·AI 봇이 페이지를 읽는다', '공개 화면이 SPA 셸 — 본문 0자. 랜딩만 읽힘', '우리(공개 웹 레이어 개발)'],
        ['② 색인', '검색 색인에 들어간다', 'saigon-rider.com 서치콘솔 등록 [미확인] · 사이트맵·IndexNow 없음', '우리(1회 등록 + FactMind 부품)'],
        ['③ 검색 후보', '질문에 맞는 문서로 뽑힌다', '"đường X có ngập không" 에 답하는 페이지가 세상에 없음 — 비어 있는 자리', '우리(데이터 → 페이지 설계)'],
        ['④ 선택·인용', '여러 후보 중 근거로 쓰인다', '제3자 언급 0. 신뢰·권위 없음', '언론·그룹·사장이 우리 페이지를 가져다 쓰게 — 공공재 전략'],
        ['⑤ 설명', '이름과 사실이 정확히 설명된다', '스토어·랜딩 문구 불일치', '우리(한 문장 통일)'],
    ],
    [20, 44, 68, 42],
))
story += [P('FactMind 에서 배운 것 세 가지 (한국 실측, 그대로 적용)', 'h2')]
story += bullets([
    '<b>JSON-LD · IndexNow · 사이트맵은 "위생"이지 레버가 아니다.</b> 통제 비교에서 schema 추가의 인용 효과는 잡음 수준이었다. 레버는 '
    '(a) 조건 질문에 답하는 <b>고유 데이터의 밀도</b>와 (b) <b>제3자 언급</b>이다. 그래서 침수 데이터를 공공재로 푼다(§3 역발상 ④).',
    '<b>얇은 페이지는 거부된다.</b> 본문 수백 자 프로필, 1건짜리 목록은 Google 이 Soft 404 로 판정했다(2026-10-09 실측). 동×업종 허브는 업체 10곳 이상일 때만 공개한다.',
    '<b>엔진마다 색인이 다르다.</b> Google 3종 = Google, ChatGPT = 자체+Bing, Perplexity = 자체, Claude = Brave. 베트남은 Google 이 95.6% 라 Google 한 곳이 거의 전부지만, '
    'robots 에서 AI 봇 16종을 허용하는 FactMind 규칙은 그대로 가져온다.',
])
story.append(PageBreak())

# ═══════════════════════ §2 노출 엔진 설계 ═══════════════════════
story += [
    P('§2. 노출 엔진 설계 — 베트남 사람의 질문 → 우리 페이지 → 우리 데이터', 'h1'),
    P('왼쪽은 호치민 라이더가 실제로 Google·AI 에 치는 말. 가운데는 그 질문에 답하는 공개 페이지. 오른쪽은 이미 앱 안에 있는 데이터. '
      '"신규" 는 공개 웹 레이어(서버 렌더 정적 페이지)로 새로 내보내는 것이고, 데이터 자체는 전부 있다.', 'body'),
]
story.append(table(
    ['사람의 질문', '답하는 페이지', '데이터(있음)', '갱신', '상태'],
    [
        [M(vi('Đường Nguyễn Hữu Cảnh hôm nay có ngập không?') + '<br/>(이 길 오늘 잠겼나)', 'cell'),
         '/ngap/{도로} — 도로별 침수 현황: 오늘 사용자 제보(시각·건수) · 공식 경보(출처 표기) · 과거 상습 구간 · 우회로. 자체 예측은 공개 안 함(기상수문법, D2)', '침수 제보 · 상습 구간 · 공식 경보 연동 · 자체 길안내', '실시간', '신규'],
        [M(vi('Tiệm sửa xe gần Phú Nhuận mở cửa chủ nhật') + '<br/>(푸년 근처 일요일 여는 정비소)', 'cell'),
         '/{동}/sua-xe/ — 동×업종 허브(업체 ≥ 10곳일 때만 공개)', 'repair_shop DB · 비즈프로필 · 영업시간 · 후기', '일 1회', '신규'],
        [M(vi('Tiệm sửa xe ABC đánh giá') + '<br/>(ABC 정비소 평가)', 'cell'),
         '/biz/{slug} — 업체 페이지: 정보 · 후기 · 소식 · 가격표 · 지도', '비즈프로필 · 후기 · 소식 · 가격표', '변경 시', 'SPA → 정적'],
        [M(vi('nón bảo hiểm cũ Bình Thạnh') + '<br/>(빈탄 중고 헬멧)', 'cell'),
         '/cho/{동}/{카테고리} 매물 허브 + /listing/{id} 매물 페이지(판매자 닉네임만, 좌표는 동 단위)', '동네마켓 매물 · 찜 · 신뢰 지표', '시간 단위', '신규'],
        [M(vi('trạm xăng gần đây') + '<br/>(근처 주유소)', 'cell'),
         '/tram-xang/{동} — 동별 주유소 목록', '주유소 DB(이웃 제보)', '일 1회', '신규'],
        [M(vi('Saigon Rider là gì') + '<br/>(사이공라이더가 뭐야)', 'cell'),
         '홈 · 소개 — 있음. 홈에서 위 페이지들로 가는 링크 0개 → 보강(FactMind 10-06 실측 원인 그대로)', '랜딩', '—', '보강'],
    ],
    [46, 56, 40, 14, 18],
))
story.append(Spacer(1, 2 * mm))
story.append(box([
    P('실측 발견(10/21) — saigon-rider.com 에 이미 "읽히는 면" 이 일부 있다', 'eyebrow'),
    P('사이트맵 인덱스가 둘로 갈린다: sitemap-site.xml(17 URL — 홈 3개 언어 + 블로그 3편 "Đi xe máy mùa mưa Sài Gòn" 등, Article JSON-LD, 본문 8,100자) 과 '
      'sitemap-fm.xml(10 URL — 업체 프로필 /b/saigon-rider-official-…/ 1곳, 목록 /l/hcmc-sai-gon/ ×3개 언어). 서치콘솔 소유 확인도 DNS TXT 로 돼 있다. '
      '단 업체 프로필은 본문 1,695자, 목록은 업체 1곳·884자 — FactMind 가 10-09 에 Soft 404 로 거부당한 바로 그 모양이다. '
      '이 층을 어느 코드가 만드는지는 saigon_rider·factmind 두 저장소 어디에도 없다(서버 측 또는 미반영 작업) → Stage 0 에서 출처를 확인하고, 있으면 새로 만들지 않고 그 위에 500곳을 붓는다.', 'body'),
], bg=WARN_BG, border=ORANGE))
story += [P('FactMind 에서 가져오는 부품 (C:\\factmind\\site)', 'h2')]
story.append(table(
    ['부품', '있는 곳', '사이공라이더에서 하는 일'],
    [
        ['수집 진단 A01~A07', 'public_delivery.diagnose', '공개 페이지가 봇에 읽히는지(robots · 본문 · canonical · 사이트맵) 매 배포 후 자동 점검'],
        ['사이트맵 생성·점검', 'public_delivery.sitemap_*', '페이지 유형별 사이트맵 + 루트 연결(네이버·Bing 이 루트만 읽던 10-06 교훈)'],
        ['IndexNow 송신 + 키 파일', 'public_delivery.indexnow_send · self_service.indexnow_key_file', '새 침수 페이지·업체 페이지를 즉시 알림(Bing·Yandex 계열 — 베트남 비중 낮아 보조)'],
        ['JSON-LD 생성', 'public_delivery.public_schema', 'LocalBusiness · Product · Event(침수) 구조화 — 위생용'],
        ['robots AI 봇 허용 규칙(16종)', 'FactMind robots 정책', 'Googlebot · OAI-SearchBot · ClaudeBot · PerplexityBot 등 허용 목록 복사'],
        ['AI 인용 관측기(observer.v1)', 'engine/observer', '채널을 네이버 → Google AI Overviews · Gemini · ChatGPT 로 교체해 "우리 이름이 답에 나오나" 주간 측정'],
        ['등록 절차', '서치콘솔 1회 등록 경험', 'saigon-rider.com 1곳 등록(대표 로그인 1회). 업체·고객에게 등록을 요구하지 않음'],
        ['실패 교훈', '10-06 · 10-09 실측 기록', '홈→하위 링크 0개 · 본문 635자 · 1건 목록 Soft 404 → 밀도 게이트·내부 링크·RSS 를 처음부터'],
    ],
    [40, 54, 80],
))
story += [P('기술 전제', 'h2')]
story += bullets([
    '<b>공개 웹 레이어</b> = BFF 데이터 → 정적 HTML 생성(FactMind 빌드 방식) → nginx 서빙. 앱(SPA)은 그대로 두고 그 옆에 "읽히는 면"을 하나 더 세운다. hreflang vi/ko/en.',
    '<b>개인정보</b>: 매물은 닉네임·동 단위 위치만, 전화·정밀 좌표 없음. 업체는 사장이 공개 동의한 정보만. 침수 제보는 익명 집계.',
    '<b>앱으로 다리</b>: 모든 공개 페이지 하단 = "앱에서 알림 받기 / 채팅하기" → Play 배지 + Zalo OA. 공개 열람(/market·/biz·/map)이 이미 로그인 없이 열리므로 딥링크로 바로 연결.',
])
story.append(Spacer(1, 5 * mm))

# ═══════════════════════ §3 역발상 ═══════════════════════
story += [P('§3. 역발상 일곱 가지 — 통념을 뒤집으면 우리가 가진 것이 무기가 된다', 'h1')]
story.append(table(
    ['#', '통념', '역발상', '쓰는 기술(있음)', '비용 성격'],
    [
        ['①', '앱을 깔게 하라', '설치를 팔지 말고 <b>답</b>을 판다. 질문에 답하는 공개 페이지가 먼저, 앱은 "더 보려면"',
         '공개 열람 · 딥링크 · 침수·업체·매물 데이터', '개발 시간'],
        ['②', '사용자를 모객하라', '<b>사장</b>을 모객한다. 업체 페이지 = 사장의 무료 Google 존재("Cửa hàng của bạn lên Google miễn phí"). 사장이 QR·Zalo 로 자기 페이지를 퍼뜨린다',
         '비즈프로필 · 소식 · 후기 · biz 귀속 코드 · 파트너 라운지', '현장 인건(이미 계획된 알바)'],
        ['③', '우리 피드로 모아라', '경쟁 채널이 유통망. Facebook 그룹·Zalo 에 매일 캡처+링크. 토종 SNS(Lotus·Gapo)가 죽은 이유를 반대로 쓴다',
         'ref/UTM 귀속 · 관리자 공지', '알바 1명'],
        ['④', '데이터는 우리 안에 가둬라', '침수 데이터를 <b>공공재</b>로. 임베드 위젯·언론 제공·아파트 관리위·대학 공유 → 제3자 언급(관문 ④)을 돈 없이 만든다',
         '침수 제보·예측 · 자체 지도', '0 (위젯 개발만)'],
        ['⑤', '사용자에게 보상을 주라', '돈을 <b>제보자·사장</b>에게. "오늘 첫 침수 제보" RP, 사장에겐 노출 크레딧. 사용자 일반 보상은 쿠폰 라이브 뒤',
         'RP 원장 · 배지 · 광고 크레딧(지면 OFF 라도 적립 가능)', 'RP 원가'],
        ['⑥', '브랜드를 광고하라', '<b>한국인 대표 캐릭터</b>. 오토바이 위에서 "오늘 사이공 어디 잠겼나" 주 2편. 외국인이 베트남 일상을 진지하게 다루는 포맷(가설)',
         '쇼츠 제작(대표) · 히엔 보이스오버', '제작 시간'],
        ['⑦', '광고비를 늘려라', '광고는 <b>측정 실험</b>. 일 20만 VND 2주, 반경 타깃·Android 만, 설치→가입 전환을 재는 용도. 결과가 좋아도 상한 월 500만',
         'Install Referrer · Firebase · Meta SDK(신규)', '월 ≤ 500만 VND'],
    ],
    [8, 28, 72, 42, 24],
))
story += [Spacer(1, 3 * mm)]
story.append(box([
    P('②가 가장 큰 역발상이다 — 그리고 FactMind 의 베트남 버전이다', 'eyebrow'),
    P('베트남 소상공인(94%가 중소·70%가 10인 미만)은 대개 Facebook 페이지만 있고 웹사이트·Google 비즈니스 프로필이 없다[미확인 — 통계 못 찾음, 현장 관찰 기반 가설]. '
      '우리 업체 페이지가 Google 에서 "tiệm sửa xe ABC" 로 뜨는 순간, 사장에게 사이공라이더는 "손님 보내주는 앱"이 아니라 "내 가게의 인터넷 주소"가 된다. '
      '그 가치는 사장이 스스로 퍼뜨린다. 8월 업체 사전등록 계획(500곳·현장 알바)은 이 가치 제안을 들고 가면 설득이 훨씬 쉬워진다. '
      'FactMind 가 한국에서 "우리 페이지를 검색엔진·AI 가 가져가게" 하려는 일과 같은 일을, 사이공라이더는 500개 업체 페이지로 베트남에서 한다.', 'body'),
]))
story.append(PageBreak())

# ═══════════════════════ §4 현재 위치 ═══════════════════════
story += [P('§4. 현재 위치 — 2026-10-21 실측', 'h1')]
story.append(table(
    ['항목', '실측', '영향'],
    [
        ['Google Play', '라이브. com.saigonrider.user, 다운로드 "10+", 설명 "Mua bán xe máy, đồ cũ và kết nối cộng đồng biker" [공식]', '공개됐지만 아무도 모름'],
        ['App Store', '심사 중', '유료 실험은 Android 만'],
        ['랜딩', '스토어 배지·소셜 링크·픽셀 없음(HTML·소스 양쪽) [저장소]', '내려받을 통로 없음 — 즉시 수정'],
        ['공개 화면(앱)', 'app.saigon-rider.com 의 /market · /biz · /map 은 로그인 없이 열리지만 SPA 셸(3.5KB) — og 메타·서버 렌더 없음 [저장소·실측]', '사람은 보지만 봇은 못 읽음 → 공개 웹 레이어'],
        ['공개 층(사이트)', 'saigon-rider.com 에 업체 프로필 /b/ 1곳 · 목록 /l/ · 블로그 3편 · 사이트맵 2종 · 서치콘솔 DNS 소유 확인 [실측]. 생성 코드는 두 저장소에 없음', '이미 있는 층 위에 500곳 투입. 얇은 상태로 두면 Soft 404'],
        ['유입 귀속(웹)', 'ref=agent / u / biz + UTM first-touch 구현 완료 [저장소]', '모든 링크에 출처 태그 가능 — 강점'],
        ['설치 귀속(앱)', 'Firebase · AppsFlyer · Meta SDK 없음 [저장소]', '광고 실험 전 필수'],
        ['메시지', '스토어 "중고·바이커" vs 랜딩 "동네 생활 앱" 불일치 [저장소]', '한 문장 통일'],
        ['보상·공급·지면', 'UrBox NDA 단계 이후 [미확인] · 업체 500곳 시딩 결과 [미확인] · ADS_ENABLED=false [저장소]', '쿠폰·광고 상품 홍보 금지, 시딩 선행 확인'],
    ],
    [26, 100, 48],
))
story += [P('이미 가진 기술 → 홍보 자산', 'h2')]
story.append(table(
    ['기술 자산', '상태', '홍보에서 쓰는 법'],
    [
        ['침수 예측·실시간 제보·상습 구간 · 자체 지도(37개 동)', '완료', '도로별 침수 페이지 + 임베드 위젯 + 매일 그룹 유통(1차 훅)'],
        ['정비소·주유소 DB · 비즈프로필·소식·후기·가격표 · QR 수동 거래', '완료', '동×업종 허브 · 업체 페이지 · 사장 유통망(역발상 ②)'],
        ['동네마켓: 매물·채팅·가격제안·약속·키워드 알림·찜 · 거래 상태머신', '완료', '매물 허브·공유 카드 · 설 전 중고 훅(2차)'],
        ['자체 길안내(Valhalla) · 실시간 위치공유 채널·ETA', '완료', '침수 우회로 · "안전한 만남" 데모 소재'],
        ['유입 귀속 ref/UTM · 딥링크 LinkRouter · 공개 열람', '완료', '페이지 → 앱 다리, 채널별 측정'],
        ['푸시(FCM/APNs) · 알림 outbox · 관리자 콘솔(신고·제재·공지)', '완료', '비 예보 알림 · 유입 급증 시 품질 방어'],
        ['RP·Gold 원장 · 미션 엔진 · 배지(창립 셀러) · 광고 계약·결제·크레딧', '완료(쿠폰·지면 대기)', '제보자·사장 보상 통화(역발상 ⑤)'],
        ['Zalo 로그인(코드) · Google/Apple · SMS OTP · 3개 언어', 'Zalo 승인 [미확인]', '베트남 가입 마찰 최소화'],
        ['FactMind: 수집 진단 · 사이트맵 · IndexNow · JSON-LD · AI 관측기 · 등록 경험', '완료(한국 운영 중)', '§2 부품 그대로 이식'],
        ['공개 웹 레이어 · 분석 SDK · Install Referrer · 침수 위젯', '없음', 'Stage 0~1 신규 개발'],
    ],
    [66, 30, 78],
))
story.append(PageBreak())

# ═══════════════════════ §5 시장 사실 ═══════════════════════
story += [P('§5. 베트남 시장 사실 — 조사 결과 (요약)', 'h1'), P('5-1. 질문과 사람이 어디에 있나 (2026)', 'h2')]
story.append(table(
    ['채널', '규모', '등급', '우리의 사용'],
    [
        ['Google 검색', '베트남 검색 점유 95.6% · Cốc Cốc 3.6% · Bing 0.4% (2026-06 StatCounter)', '[공식]', '노출 엔진의 주 무대. 서치콘솔 1회 등록'],
        ['생성형 AI', '15~64세 26.5% 사용(동남아 2위, Microsoft 2026). 지식노동자 88%(2024)', '[공식/언론]', 'AI 봇 허용 + 인용 관측'],
        ['Facebook', '광고 도달 7,900만(전 인구 1억 200만 수준)', '[공식]', '그룹 유통(손) + 반경 광고 실험'],
        ['Zalo', '월활성 7,830만~8,130만', '[공식/블로그]', 'OA 알림·CRM · 사장 소통'],
        ['TikTok · YouTube', '7,610만 · 6,210만', '[공식]', '오가닉 쇼츠'],
        ['Instagram', '1,170만(11%)', '[공식]', '제외'],
    ],
    [26, 76, 24, 48],
))
story += [P('5-2. 매체 단가 — 실험용 소액이라도 알고 쓴다', 'h2')]
story.append(table(
    ['매체', '단가', '등급'],
    [
        ['Meta 앱설치 광고', 'CPM 18,000~33,000 VND · CPC 900~1,500 VND · 설치당(CPI) 베트남 $0.30~0.90', '[블로그]'],
        ['Zalo OA(2026-06-01 요금표)', '기본 무료 / 성장 250만 VND·년(월 약 21만, 챗봇·API·그룹 1개) / 메시지 건당 200~300 VND / 그룹 1,000명 30만·월', '[공식]'],
        ['Zalo Ads', 'CPC 300~800 VND · 일 최소 5만 VND', '[블로그]'],
        ['TikTok Ads', '광고그룹 일 최소 $20 → 매일 돌리면 월 1,300만 VND 바닥 → 오가닉 우선', '[블로그]'],
        ['KOC(소비자형 인플루언서)', '나노 50만~300만 VND/건 · 20명 패키지 약 400만', '[블로그]'],
        ['Apple Search Ads', '베트남 가능', '[공식]'],
    ],
    [42, 104, 28],
))
story += [P('5-3. 타깃 · 경쟁 · 법규', 'h2')]
story.append(table(
    ['사안', '사실', '우리에게'],
    [
        ['플랫폼 기사(tài xế công nghệ)', '호치민 약 40만 명/대. 2026 신규 휘발유 기사 등록 중단 → 2029 전면 전기 전환 안 [언론]', '콘텐츠 타깃. 유료 모객·km 보상은 경제 캡 뒤'],
        ['오토바이', '광역 호치민 1,100만 대 배출검사 대상 [언론]', '배출검사 안내도 "라이더 정보" 소재'],
        ['침수 정보', '시 당국 UDI Maps · FEDS · 2026-09 재난감시 — 공급자 중심·분산. 상반기 침수 도로 26+8곳 [언론]', '소비자용 도로별 페이지는 빈 자리'],
        ['중고거래', 'Chợ Tốt 월 1,000만 · Facebook 리셀 그룹 60만~80만 명 [언론/블로그]', '정면 승부 금지, "3km 이웃+오토바이 용품"'],
        ['토종 SNS', 'Lotus(1,200억 VND)·Gapo·Hahalolo 전부 침몰 — "Facebook 과 같은 바다" [언론]', '커뮤니티로 팔지 않음'],
        ['광고법 2026-01-01', '인플루언서는 실제 사용 제품만, 광고 표기, 계약·세무 [공식]', 'KOC 2주 실사용 후 제작, #quảngcáo'],
        ['판촉 시행령 81→128→239/2026', '경품 ≤ 판매가 50% · 추첨형 등록 · 사은품형 신고/1억 VND 미만 면제 · 포인트 적립은 신고 대상 해설 [공식/블로그]', 'RP·쿠폰·추첨 사전 분류(법무 1회)'],
        ['기상수문법 · 시행령 155/2024(2025-02-01 시행, 136/2025 개정)', '예보·경보 "활동"은 허가 대상. 공식 예보·경보를 전달할 땐 출처 명시 의무(미표기 300만~500만 VND, 출처 없는 전파 500만~1,000만). 무허가 예보 활동은 2,500만~3,000만(구 시행령 기준) [공식/언론]',
         '★결정 D2: 공개 페이지엔 사용자 제보(사실)·공식 경보(출처 표기)·과거 상습 구간만. 자체 "침수 예측"은 공개하지 않음'],
        ['재외동포', '베트남 192,683명(2024 말) · 호치민권 [미확인] [공식]', '첫 리뷰·피드백용, 밀도용 아님'],
    ],
    [36, 94, 44],
))
story.append(PageBreak())

# ═══════════════════════ §6 단계별 접근 ═══════════════════════
story += [
    P('§6. 단계별 접근 — 4 Stage, 통과 기준을 넘어야 다음으로', 'h1'),
    P('기간은 2026-10-21 기준. 각 Stage = 목표 → 할 일 → 쓰는 기술(있음) → 새로 만들 것 → 외부 비용 → 통과 기준. '
      '노출 지표(색인 페이지 · 검색 노출 · AI 인용 · 제3자 링크)와 전환 지표(가입 · 활성 · 매물)를 함께 본다.', 'body'),
]

# Stage 0
story.append(stage_header('0', '기본기 — 측정 · 통로 · 문장 · 공개 웹 레이어 설계', '10/21 ~ 11/03 (2주)',
                          '노출 엔진을 세울 땅을 고른다. 이 단계가 끝나기 전엔 광고비 0원.'))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['#', '할 일', '담당', '검증'],
    [
        ['0-1', '랜딩에 Google Play 배지 + "iOS 출시 알림"(Zalo OA 팔로우) + Facebook·Zalo·TikTok 링크 + Meta 픽셀·GA4. 홈에서 공개 페이지로 가는 링크 구조 설계', '권도일', '랜딩→스토어 1클릭'],
        ['0-2', '스토어 설명·랜딩 첫 문장을 한 문장으로 통일. 스크린샷 1·2 = 침수 지도. 부제에 베트남어 키워드(báo ngập · chợ đồ cũ · tiệm sửa xe · tài xế)', '권도일+히엔', '두 곳 문구 동일'],
        ['0-3', '설치 귀속: Play Install Referrer 플러그인(capawesome 또는 @capgo/capacitor-install-referrer) → 기존 tracking/first-touch 연결 + @capacitor-firebase/analytics. '
                '★Meta SDK 는 넣지 않는다 — 광고 실험은 "랜딩→Play 링크의 referrer 파라미터" 로 측정(결정 D4). 개인정보처리방침 vi 갱신', '권도일', '클릭→설치→가입 소스별 집계'],
        ['0-4', '서치콘솔 소유 확인은 이미 돼 있음(DNS TXT 실측 10/21) → 사이트맵 제출·색인 상태 확인만. robots 에 AI 봇 허용 규칙 추가 · 공개 웹 레이어 설계서(페이지 유형 6종, URL, 밀도 게이트, 개인정보 규칙, 침수 공개 범위 D2)', '권도일(+FactMind 부품)', '설계서 1장 · 색인 보고서 열람'],
        ['0-5', 'Facebook 페이지 · Zalo OA(성장) · TikTok 계정 · Meta 광고계정 비즈 인증', '히엔+권도일', '계정 3개 + 광고계정'],
        ['0-6', '업체 500곳·매물 시딩 실행 상태 확인. 미완이면 "내 가게 Google 에 올리기" 가치 제안으로 재착수(선행)', '대표 결정', '존 업체 ≥ 250 · 매물 ≥ 150'],
        ['0-7', '법무 1회: RP→쿠폰 · 제보 보상 · 추첨 분류, KOC 계약서, 기상수문법 해석(D2), 공개 데이터 개인정보 규칙', '히엔+현지 법무', '분류표 1장'],
        ['0-8', 'saigon-rider.com 기존 공개 층(/b/ · /l/ · blog · sitemap-fm.xml)의 생성 코드·배포 경로 확인. 있으면 공개 웹 레이어 1차를 그 위에 얹고, 없으면 FactMind 부품으로 신설', '권도일', '생성 경로 문서 1장'],
    ],
    [10, 96, 28, 40],
))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['쓰는 기술(있음)', '새로 만들 것', '외부 비용', '통과 기준'],
    [
        [P('ref/UTM 귀속 · 랜딩 · 공개 열람 · FactMind 진단·등록 경험', 'cell'),
         P('Install Referrer · Firebase · Meta SDK · 랜딩 배지/픽셀 · 리스팅 개정 · 공개 웹 레이어 설계서', 'cell'),
         P('Zalo OA 250만 VND/년. 그 외 인건', 'cell'),
         P('0-1~0-5 완료 · 0-6 기준 충족 · 0-7 분류표. 미달 시 Stage 1 의 유료 실험만 보류(노출 엔진 개발은 계속)', 'cellb')],
    ],
    [46, 56, 30, 42], zebra=False, head_bg=TEAL,
))
story.append(PageBreak())

# Stage 1
story.append(stage_header('1', '노출 엔진 가동 + 우기 침수 공공재', '11/04 ~ 12/15 (6주)',
                          '공개 페이지가 색인되고, 침수 지도가 언론·그룹에 돌아다니고, 존 주간 활성 300명.'))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['축', '할 일', '채널·귀속'],
    [
        ['노출 엔진(개발 2~3주)', '공개 웹 레이어 1차: /ngap/{도로}(상습 구간 20곳부터) · /biz/{slug} 정적화(검증 업체) · /{동}/{업종}/ 허브(업체 ≥ 10곳인 조합만). '
         '사이트맵 유형별 + 루트 연결 · IndexNow · JSON-LD · 홈→하위 링크 · RSS. 배포마다 FactMind A01~A07 진단', '서치콘솔 · IndexNow'],
        ['침수 공공재', '임베드 위젯(iframe/이미지 URL, "nguồn: Saigon Rider" 표기) + 공개 데이터 페이지. 비 오는 날마다 Tuổi Trẻ·Thanh Niên 지역 기자, 존 아파트 관리위, 대학 학생회, '
         'Facebook 그룹 관리자에게 제공. 보도자료는 "오늘 어디 잠겼나" 데이터로만', '언론 · 그룹 (제3자 링크)'],
        ['매일 유통(손)', '비 예보일 오전 Zalo OA 브로드캐스트 + Facebook 그룹 5~10곳에 침수 지도 캡처 + 도로별 페이지 링크. 히엔 + 알바 1명', 'utm_source=fbgroup / zalo'],
        ['대표 쇼츠', '주 2편 "오늘 사이공 어디 잠겼나". 베트남어 자막 + 히엔 보이스오버. 60초 이하 같은 포맷', 'TikTok · Shorts · Reels'],
        ['사장 유통 시작', '등록 업체에 QR 스티커 + "당신 가게 페이지가 Google 에 올라갔습니다" Zalo 통지(검색 결과 캡처 첨부). 유입 1명당 노출 크레딧', 'ref=biz:코드'],
        ['제보자 보상', '"오늘 첫 침수 제보" RP(법무 분류 뒤). 운영 제보 계정 2개로 빈 지도 방지', 'RP 원장'],
        ['유료 실험', 'Meta 트래픽 광고(앱설치 목적 아님): 존 반경 2~3km · Android 만 · 일 20만 VND × 14일 = 280만 VND. 소재 = 침수 지도 영상 → 도로별 침수 페이지 → Play 링크(referrer=utm). 설치→가입·활성 1인 비용만 본다. Meta SDK 없이 측정 가능', 'Install Referrer + UTM'],
        ['교민 · KOC', '한인 카페에 솔직한 베타 리뷰 요청(스토어 리뷰 20개, 조작 금지) · KOC 나노 5명(2주 실사용 후, #quảngcáo)', 'ref=u: · utm_source=koc'],
    ],
    [30, 110, 34],
))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['쓰는 기술(있음)', '새로 만들 것', '외부 비용(6주)', '통과 기준(12/15)'],
    [
        [P('침수 예측·제보 · 자체 지도 · 비즈프로필 · 공개 열람 · 푸시 · ref 귀속 · FactMind 진단·사이트맵·IndexNow·JSON-LD·관측기', 'cell'),
         P('공개 웹 레이어 1차(3종 페이지) · 침수 임베드 위젯 · 침수 화면→"근처 매물 N건" 배너 · 비 예보 트리거 푸시', 'cell'),
         P('알바 600만 · Zalo 120만 · 광고 실험 280만 · KOC 250만 · 인쇄 100만 약 1,350만 VND(약 74만 원)', 'cell'),
         P('색인 페이지 ≥ 150 · 서치콘솔 노출 ≥ 2만/주 · 제3자 링크 ≥ 5(언론·그룹) · 존 WAU ≥ 300 · 설치→가입 ≥ 40% · 우천일 제보 ≥ 10', 'cellb')],
    ],
    [46, 50, 36, 42], zebra=False, head_bg=TEAL,
))
story.append(Spacer(1, 3 * mm))
story.append(box([
    P('기사(tài xế công nghệ) 40만 명은 이 단계에서 어떻게 보나', 'eyebrow'),
    P('하루 100km 이상 달리는 최상위 빈도 라이더로 침수·주유·정비가 매일의 고통 → 도로별 침수 페이지의 1차 독자. 그러나 Grab·Be 공식 그룹에 묶여 있고, '
      'km 기반 RP 는 어뷰징 1순위이며, 2026 전기차 전환 압박으로 "또 뭘 깔라고?" 피로가 크다. 접근: 기사 그룹에는 페이지 링크만(유틸리티로), 기사 전용 보상은 경제 캡 재설계 뒤(Stage 3).', 'body'),
], bg=WARN_BG, border=ORANGE))
story.append(PageBreak())

# Stage 2
story.append(stage_header('2', '사장 유통망 + 설 전 중고거래', '12/16 ~ 1/20 (5주, 설 2027-02-06)',
                          '업체 페이지가 사장 손으로 퍼지고, 매물 허브가 색인되고, 존 주간 활성 700~1,000명 · 활성 매물 400건.'))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['#', '할 일', '보상·통화', '귀속'],
    [
        ['2-1', '공개 웹 레이어 2차: /cho/{동}/{카테고리} 매물 허브(≥ 10건 조합만) + /listing/{id} + /tram-xang/{동}. 매물 공유 카드(OG 이미지)', '—', '서치콘솔'],
        ['2-2', '사장 가치 제안 본격: "Cửa hàng của bạn lên Google miễn phí" 한 장 안내지 + 검색 결과 캡처. 사장이 자기 페이지 QR 을 매장·Zalo 상태에 올리게. 소식 올리면 페이지 갱신 → 재색인', '노출 크레딧 · 검증 셀러 배지', 'ref=biz:코드'],
        ['2-3', '훅 전환: 스토어·랜딩·쇼츠를 "Dọn nhà đón Tết" 로. Facebook 리셀·아파트 그룹에 "존 매물 모음(허브 링크)" 주 2회', '—', 'utm_source=fbgroup'],
        ['2-4', '인센티브 사다리(콜드스타트 §8): 매물 등록 → 거래인증샷 → 친구 초대(u 코드). 보상은 법무 분류대로 RP·배지, UrBox 라이브 시 쿠폰', 'RP · 배지 · (쿠폰)', 'ref=u:코드'],
        ['2-5', '정비소·용품점 앵커 셀러: 업체 페이지 ↔ 매물 다리("이 가게 매물 보기"). 창립 셀러 배지 존 초기 N명', '검증 셀러 · 창립 배지', 'ref=biz:코드'],
        ['2-6', 'KOC 10~15명 "내 방 정리하고 이웃에게 팔기" · 유료 실험은 Stage 1 결과가 기준 안일 때만 월 ≤ 500만 VND', '건당 50만~150만 VND', 'utm_source=koc'],
    ],
    [10, 106, 32, 26],
))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['쓰는 기술(있음)', '새로 만들 것', '외부 비용(5주)', '통과 기준(1/20)'],
    [
        [P('매물·채팅·가격제안·약속 · 위치공유·ETA · 키워드 알림 · RP 원장 · 배지 · 거래 상태머신 · 비즈 소식·후기', 'cell'),
         P('공개 웹 레이어 2차 · 거래인증샷 제출·검수 · 초대 보상 규칙 · 사장용 "내 페이지 성과" 카드(검색 노출 수)', 'cell'),
         P('알바 500만 · KOC 800만 · 인센티브 400만 · Zalo 100만 · 광고 ≤ 500만 약 1,800만~2,300만 VND(약 100만~125만 원)', 'cell'),
         P('색인 페이지 ≥ 600 · 서치콘솔 클릭 ≥ 3천/주 · AI 인용 관측 ≥ 1건/주 · 존 WAU ≥ 700 · 활성 매물 ≥ 400 · 사장 자발 공유 ≥ 100곳 · D7 재방문 ≥ 20%', 'cellb')],
    ],
    [46, 50, 36, 42], zebra=False, head_bg=TEAL,
))
story.append(Spacer(1, 4 * mm))

# Stage 3
story.append(stage_header('3', '확장 — 인접 동 · iOS · 광고 지면 · Zalo Mini App · FactMind 베트남', '1/21 ~ (게이트 통과 후)',
                          '존 1곳에서 검증된 페이지 유형·전환을 복제한다. 동시 확장 금지, 인접 동 하나씩.'))
story.append(Spacer(1, 2 * mm))
story.append(table(
    ['확장 축', '내용', '조건'],
    [
        ['지역', 'Chợ Lớn(부품 시장, parts 보강 1순위) → 고밥 등 인접 동. 한 동씩 Stage 1→2 를 압축 반복. 페이지 유형은 그대로, 데이터만 늘림', 'Stage 2 게이트 통과'],
        ['플랫폼', 'iOS 정식 · Apple Search Ads 소액 · Zalo Mini App(설치 없이 Zalo 안에서 실행, Be·Highlands 채택) 검토', 'iOS 게시 · 개발 여력'],
        ['수익', 'ADS_ENABLED 켜기 → 존 업체에 광고 상품 판매. 여정 감사 원칙: "한 구의 공급·응답 속도 확보 전 광고 확장 금지"', 'WAU 1,000 · 업체 소식 반응'],
        ['기사층', 'km 기반 RP 경제 캡 재설계 후 기사 전용 미션 · 쉼터·정비소 제휴', '쿠폰 라이브 · 경제설계 개정'],
        ['FactMind 베트남', '업체 페이지 "검색·AI 노출 리포트"를 사장에게 제공 → FactMind 상품의 베트남 검증. 한국 FactMind 와 부품·관측기 공유', 'Stage 2 사장 공유 ≥ 100곳'],
    ],
    [24, 110, 40],
))
story.append(PageBreak())

# ═══════════════════════ §7 예산·지표 ═══════════════════════
story += [P('§7. 비용 구조와 지표 체계', 'h1'),
          P('1차 매체 중심안(월 3,700만 VND)과 비교. 이 안은 외부 비용을 절반 이하로 줄이고 개발 시간을 넣는다. 수치는 §5-2 블로그 단가 기반 추정이며 Stage 1 첫 2주 실측으로 갈아끼운다.', 'body')]
story.append(table(
    ['항목', '1차 매체안(월)', '이 안 Stage 1(6주)', '이 안 Stage 2(5주)', '성격'],
    [
        ['Meta 앱설치 광고', '1,500만', '280만(실험 14일)', '≤ 500만', '측정용'],
        ['Zalo OA + 메시지', '80만', '120만', '100만', '고정'],
        ['TikTok 유료', '300만', '0', '0', '오가닉'],
        ['KOC', '800만', '250만(5명)', '800만(10~15명)', '소액'],
        ['현장 유통 알바(그룹 게시·스티커·사장 통지)', '400만', '600만', '500만', '핵심 인건'],
        ['인쇄·QR·안내지', '100만', '100만', '50만', '—'],
        ['인센티브(RP 원가·크레딧)', '500만', '0~100만', '400만', '제보자·사장 우선'],
        [P('외부 비용 합계', 'cellb'), P('약 3,700만', 'cellb'), P('약 1,350만 (약 74만 원)', 'cellb'), P('약 2,350만 (약 130만 원)', 'cellb'), ''],
        ['개발 시간(내부)', '소(SDK·배지)', '공개 웹 레이어 1차 2~3주 + 위젯 + SDK', '2차 1~2주 + 인증샷·보상 규칙', '권도일 + FactMind 부품'],
        ['대표 시간', '쇼츠', '쇼츠 주 2편 · 서치콘솔 로그인 1회', '쇼츠 주 2편', '—'],
    ],
    [50, 26, 38, 36, 24],
))
story += [P('지표 체계 — 노출과 전환을 한 표에서 매주', 'h2')]
story.append(table(
    ['구분', '지표', '12/15 (Stage 1)', '1/20 (Stage 2)', '측정 수단'],
    [
        ['노출', '색인된 공개 페이지 수', '≥ 150', '≥ 600', '서치콘솔 색인 보고서'],
        ['노출', '검색 노출 / 클릭(주)', '노출 ≥ 2만', '클릭 ≥ 3천', '서치콘솔'],
        ['노출', '제3자 링크(언론·그룹·사장 공유)', '≥ 5', '≥ 100곳(사장) + 언론 3', '서치콘솔 링크 · 수동 집계'],
        ['노출', 'AI 답변에 이름 등장', '측정 시작', '≥ 1건/주', 'observer 베트남 채널(Google AI Overviews · Gemini · ChatGPT)'],
        ['전환', '존 WAU(5개 동 좌표로 주 1회 이상)', '300', '700~1,000', 'useLocationStore + 서버'],
        ['전환', '페이지→앱 설치→가입', '가입 ≥ 40%', '≥ 45%', 'Install Referrer + Firebase'],
        ['전환', '활성 매물(존) · 우천일 제보', '150 · 10', '400 · —', '서버'],
        ['전환', '활성 1인 획득비(광고분)', '≤ 4만 VND', '≤ 3만 VND', 'Meta 지출 ÷ 서버 집계'],
        ['전환', 'D7 재방문', '측정 시작', '≥ 20%', 'Firebase'],
    ],
    [14, 56, 28, 34, 42],
))
story.append(PageBreak())

# ═══════════════════════ §8 하지 말 것 · 미확인 · 결정 ═══════════════════════
story += [P('§8. 하지 말 것', 'h1')]
story += bullets([
    '측정 없이 광고 켜기 · 광고를 "확장 수단"으로 쓰기(실험 상한 월 500만 VND).',
    '얇은 페이지·1건짜리 목록을 내보내기(Soft 404). 밀도 게이트 미달 조합은 공개하지 않는다.',
    '"커뮤니티 앱"으로 포지셔닝(토종 SNS 교훈) · 쿠폰 미연동 상태에서 "보상" 홍보 · 미완 기능(가챠·상점·광고 성과) 홍보.',
    '가짜 매물·가짜 리뷰·가짜 제보 — 신뢰 즉사. 공개 페이지에 올라가면 검색 결과에 영구 기록된다.',
    '매물·사용자 개인정보를 공개 페이지에 노출(전화·정밀 좌표) · 업체 정보를 사장 동의 없이 공개.',
    '호치민 전역 타깃 · KOC 미사용 상태 의뢰(2026 광고법) · 추첨·사은품 분류 없이 집행(판촉 시행령) · 인스타그램·X.',
])
story += [P('확인하지 못한 것 (판단에 영향 있음)', 'h2')]
story += bullets([
    '업체 사전등록(500곳)·매물 시딩 실행 결과 · UrBox/Got It 쿠폰 연동 단계 · Zalo 로그인 앱 승인 · saigon-rider.com 서치콘솔 등록 여부.',
    '베트남 소상공인의 웹사이트·Google 비즈니스 프로필 보유율(통계 못 찾음 — 역발상 ②의 전제는 현장 관찰 가설).',
    '베트남 Google AI Overviews 노출 범위 · 베트남어 AI 답변에서 플랫폼 데이터 인용 비율(FactMind 관측기로 Stage 1 에 측정 시작).',
    '호치민권 한인 수 · 기사 Facebook 그룹 규모 · 채널별 실제 설치 단가 · 광고법 시행령 확정 · 판촉 시행령 239/2026 절차.',
    '안드로이드 공개일 · 정확한 설치 수(Play Console).',
])
story += [P('결정 — 조사로 닫은 것 (대표 지시 2026-10-21: "네가 정보 검색 후 최선으로 결정하고 보고하라")', 'h2')]
story.append(table(
    ['#', '결정', '근거'],
    [
        ['D1', '핵심 가치 = "노출 엔진이 홍보". 공개 웹 레이어를 Stage 0~1 최우선 개발 항목으로 채택', 'Google 95.6% · 공개 화면이 SPA 셸 · FactMind 5 관문 실측'],
        ['D2', '침수 공개 범위 = 사용자 제보(사실·시각·건수) + 공식 경보(출처 표기) + 과거 상습 구간. 자체 "예측"은 공개 페이지·위젯에 싣지 않음. 임베드 위젯·언론·아파트 관리위·대학에 출처 표기 조건부 무료', '기상수문법: 예보·경보 활동은 허가 대상, 전달 시 출처 명시 의무(시행령 155/2024)'],
        ['D3', '유료 광고 = 측정 실험. Stage 1 에 280만 VND(일 20만 × 14일) 1회, 이후 상한 월 500만 VND. 목적은 "트래픽"(앱설치 목적 아님)', 'Meta 앱설치 목적은 SDK 필수 → 실험엔 과함. 1차안 B(3,700만)는 측정 체계 전엔 낭비'],
        ['D4', '분석 = @capacitor-firebase/analytics + Play Install Referrer 플러그인(capawesome 또는 @capgo). Meta SDK·AppsFlyer 는 넣지 않음(Stage 3 확장 시 재검토)', 'AppsFlyer Zero 는 유료 캠페인 앱에 부적합(공식). 랜딩→Play referrer 로 Meta 없이 귀속 가능'],
        ['D5', '업체 시딩: 저장소 기준 8/11 이후 실행 흔적 없음(커밋·문서 0) → "내 가게 Google 에 올리기" 가치 제안으로 재착수. Stage 0 에 선행', '시딩 없는 노출 엔진은 빈 허브 = Soft 404'],
        ['D6', '법무 = 히엔 + 현지 법무 1회(판촉 분류 · KOC 계약서 · 공개 데이터 개인정보 · 기상수문법 해석). 계약 주체 = GOODIS(7월 대표 결정 그대로)', '세 법규 모두 "분류·해석" 1회면 충분, 상시 자문 불필요'],
        ['D7', 'FactMind 부품 = 코드 복사 + 원본 커밋 해시를 파일 머리에 기록. 공용 패키지 만들지 않음. 단 saigon-rider.com 에 이미 있는 공개 층(0-8)이 같은 패턴이면 그 코드를 우선 재사용', '배포 파이프라인이 다른 두 레포 · 3인 팀 · 1회성 이식(단순함 우선)'],
        ['D8', '쇼츠 베트남어 보이스 = 히엔 보이스오버(현지 성우 비용 0). 서치콘솔 등록은 이미 돼 있음(DNS TXT 실측) → 대표 로그인 불필요', '베트남어 검수 역할이 이미 히엔'],
    ],
    [10, 110, 54],
))
story += [P('대표 결정 — 대표만 정할 수 있는 세 가지', 'h2')]
story.append(table(
    ['#', '질문', '제안 답 (승인만 하시면 진행)'],
    [
        ['Q1 돈', 'Stage 0~2(10/21~1/20) 외부 지출 총액 승인. 업체 시딩 알바 약 1,915만(8월안 그대로) + Stage 1 약 1,350만 + Stage 2 약 2,350만 + 법무 1회 약 300만~500만 = 약 6,000만 VND(약 330만 원). 월 광고 상한 500만 포함',
         '총 6,000만 VND 상한 승인. 초과는 다시 보고'],
        ['Q2 대표 시간', '11월~1월 쇼츠 주 2편(약 24편, 편당 촬영 30분 이내 포맷). 가능한가, 아니면 히엔 출연·주 1편으로 줄이는가', '주 2편. 어려우면 주 1편 + 히엔 출연 1편'],
        ['Q3 인력 배정', '권도일 2~3주를 공개 웹 레이어 1차에 우선 배정 — 현재 진행 중인 파트너 라운지·결제 작업보다 앞에 둔다', '우선 배정. 라운지·결제는 Stage 1 중반 이후'],
    ],
    [20, 110, 44],
))
story.append(PageBreak())

# ═══════════════════════ 출처 ═══════════════════════
story += [P('출처', 'h1')]
sources = [
    'StatCounter, Search Engine Market Share Viet Nam 2026-06 — gs.statcounter.com/search-engine-market-share/all/viet-nam',
    'Microsoft Global AI Diffusion 2026(베트남 26.5%) — thesaigontimes.vn/viet-nam-dung-thu-hai-dong-nam-a-ve-ty-le-su-dung-ai-tao-sinh · doanhnghiephoinhap.vn',
    'DataReportal, Digital 2026: Vietnam — datareportal.com/reports/digital-2026-vietnam',
    'Zalo OA 요금표(2026-06-01) — zalo.solutions/oa/pricing · ZBS 메시지 — zalo.solutions/zns/pricing · Zalo Ads 단가 — miniai.vn · marketingagency.vn',
    'Meta 베트남 단가 — 저장소 ai-docs/research/260810_proximity_ad_contract_research/sources/F_meta_ads_vietnam.md (ADCostly · baoliba) · 설치 단가 — semnexus.com · businessofapps.com',
    'TikTok Ads 최소 예산 — megadigital.ai · KOL/KOC 단가 — mktcare.net · heightmedia.vn · blog.vn.revu.net',
    '광고법 개정 2026 — luatvietnam.vn (KOLs 4 quy định mới từ 01/01/2026) · brandsvietnam.com · 판촉 시행령 — luatvietan.vn (128/2024) · KPMG 239/2026 요약',
    '플랫폼 기사 40만 — vnbusiness.vn · tienphong.vn/post-1762218 · 오토바이 1,100만 — nongnghiepmoitruong.vn · 침수 시스템 — thesaigontimes.vn · znews.vn',
    'Chợ Tốt 월 1,000만 — thesaigontimes.vn · 리셀 그룹 — sapo.vn · 토종 SNS 교훈 — nhadautu.vn · baodautu.vn · Zalo Mini App — brandsvietnam.com/congdong/topic/338606',
    'Grab 공식 기사 그룹 — grab.com/vn/blog/driver/nhomfacebookchinhthonggrab · 재외동포 현황 2025 — heraldk.com · Apple Search Ads 베트남 — advertisingvietnam.com · jobs.apple.com',
    'VCCI 중소기업 94%·10인 미만 70% — vcci.com.vn · 한국 국가이미지 2025 — asianews.network · 베트남 1위 브랜드 Apple(니케이 2026) — vnreview.vn',
    'FactMind — C:\\factmind\\docs\\FACTMIND_EXPOSURE_FEASIBILITY.md(5 관문 · 위생 vs 레버 · 엔진별 색인) · site/public_delivery.py(diagnose A01~A07 · sitemap_* · indexnow_send · public_schema) · '
    'site/self_service.py(indexnow_key_file) · engine/observer · 메모리 기록 2026-10-06(홈→하위 링크 0 · 본문 635자) · 2026-10-09(1건 목록 Soft 404)',
    '저장소(saigon_rider) — docs/260717_오픈계획_검토.md · ai-docs/spec/marketplace-cold-start-strategy-final.md · ai-docs/research/260806_merchant_preregistration_ops_plan.md · '
    'ai-docs/260731_launch_readiness_verdict.md · ai-docs/260810_service_journey_conversion_retention_audit.md · frontend/src/lib/acquisition.ts · frontend/src/App.tsx · frontend/src/lib/adPlacement.ts',
    '조사 원문(판단 포함) — ai-docs/research/261021_vietnam_launch_promotion_analysis.md (§0-A 가 이 PDF 의 축)',
]
story += bullets(sources, style='small')


doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm,
                        bottomMargin=16 * mm, title='사이공라이더 베트남 홍보 — 핵심 가치와 단계적 접근 (2026-10-21)',
                        author='Saigon Rider team', subject='Vietnam promotion: core value and staged plan')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
