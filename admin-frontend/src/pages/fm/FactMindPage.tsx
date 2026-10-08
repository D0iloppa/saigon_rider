import { useEffect, useState } from 'react'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import StatCard from '../../components/StatCard'
import {
  useFmAddAiProbe,
  useFmAddConsoleCoverage,
  useFmAiProbes,
  useFmConsoleCoverage,
  useFmDiagnose,
  useFmPlatformFacts,
  useFmPublish,
  useFmSavePlatformFacts,
  useFmSubject,
  useFmRunJob,
  useFmSubjects,
  useFmSync,
  useFmVerify,
  useFmVisits,
  useFmWithdraw,
  type FmAiProbeInput,
  type FmConsoleCoverageInput,
  type FmDiagnoseItem,
  type FmLocale,
  type FmLocalized,
  type FmPlatformFacts,
  type FmSubjectRow,
  type FmSubjectStatus,
} from '../../api/fm'

const LOCALES: FmLocale[] = ['vi', 'ko', 'en']
const STATUS_META: Record<FmSubjectStatus, { label: string; tone: string }> = {
  draft: { label: '초안', tone: 'neutral' },
  published: { label: '공개중', tone: 'success' },
  withdrawn: { label: '철회', tone: 'warning' },
}
const DIAG_TONE = { ok: 'success', problem: 'error', skipped: 'neutral' } as const

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('ko-KR') : '-')
const errMsg = (err: unknown) => (err instanceof Error ? err.message : '요청에 실패했습니다.')
const emptyLoc = (): FmLocalized => ({ vi: '', ko: '', en: '' })

function StatusTag({ status }: { status: FmSubjectStatus }) {
  const meta = STATUS_META[status]
  return <Tag className={`admin-status admin-status-${meta.tone}`}>{meta.label}</Tag>
}

function SubjectDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useFmSubject(id)
  if (isLoading) return <span>불러오는 중...</span>
  if (isError || !data) return <Alert type="error" showIcon message={errMsg(error)} />
  const pub = data.publication
  const problems = pub?.verification?.problems ?? []
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="artifact_digest">{pub?.artifact_digest ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="files">
          {pub?.files.length ? pub.files.map((f) => <div key={f}>{f}</div>) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="검증">
          {pub?.verification ? `${pub.verification.ok ? '통과' : '실패'} (${fmt(pub.verification.at)}, 확인 ${pub.verification.checked.length}건)` : '-'}
        </Descriptions.Item>
      </Descriptions>
      {problems.length > 0 && (
        <Table
          size="small"
          pagination={false}
          rowKey={(_, i) => String(i)}
          dataSource={problems}
          columns={[
            { title: 'URL', dataIndex: 'url', render: (v?: string) => v ?? '-' },
            { title: '코드', dataIndex: 'reason_code', render: (v?: string) => v ?? '-' },
            { title: '사유', dataIndex: 'reason', render: (v?: string) => v ?? '-' },
          ]}
        />
      )}
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={data.events.slice(0, 20)}
        columns={[
          { title: '시각', dataIndex: 'created_at', width: 180, render: fmt },
          { title: '종류', dataIndex: 'kind', width: 160 },
          { title: '내용', dataIndex: 'body', render: (b: unknown) => <code style={{ wordBreak: 'break-all' }}>{JSON.stringify(b)}</code> },
        ]}
      />
    </Space>
  )
}

function LocalizedInputs({ label, value, onChange, multiline }: { label: string; value: FmLocalized; onChange: (v: FmLocalized) => void; multiline?: boolean }) {
  return (
    <Form.Item label={label} style={{ marginBottom: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        {LOCALES.map((l) =>
          multiline ? (
            <Input.TextArea key={l} rows={2} placeholder={l} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
          ) : (
            <Input key={l} addonBefore={l} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
          ),
        )}
      </Space>
    </Form.Item>
  )
}

function PlatformFactsCard() {
  const { data, isLoading, isError, error } = useFmPlatformFacts()
  const save = useFmSavePlatformFacts()
  const publish = useFmPublish()
  const [facts, setFacts] = useState<FmPlatformFacts | null>(null)

  useEffect(() => {
    if (data) setFacts({ ...data.facts, faq: data.facts.faq ?? [], same_as: data.facts.same_as ?? [] })
  }, [data])

  if (isError) return <Alert type="error" showIcon message="플랫폼 facts를 불러오지 못했습니다." description={errMsg(error)} />
  if (isLoading || !facts || !data) return <Card loading />

  const set = <K extends keyof FmPlatformFacts>(key: K, value: FmPlatformFacts[K]) => setFacts({ ...facts, [key]: value })
  const invalid = !facts.name.vi.trim() || !facts.description.vi.trim()
  const setFaq = (i: number, part: 'q' | 'a', v: FmLocalized) =>
    set('faq', facts.faq.map((f, idx) => (idx === i ? { ...f, [part]: v } : f)))

  return (
    <Card
      title={<Space>플랫폼 facts <StatusTag status={data.status} /> <Tag>v{data.version}</Tag></Space>}
      extra={
        <Space>
          <Button
            type="primary"
            disabled={invalid}
            loading={save.isPending}
            onClick={() =>
              save.mutate(facts, {
                onSuccess: (r) => message.success(`저장되었습니다 (v${r.version}).`),
                onError: (e) => message.error(errMsg(e)),
              })
            }
          >
            저장
          </Button>
          <Button
            loading={publish.isPending}
            onClick={() =>
              publish.mutate(data.subject_id, {
                onSuccess: (r) => message.success(`플랫폼이 발행되었습니다: ${r.url}`),
                onError: (e) => message.error(errMsg(e)),
              })
            }
          >
            플랫폼 발행
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <LocalizedInputs label="이름 (vi 필수)" value={facts.name} onChange={(v) => set('name', v)} />
        <LocalizedInputs label="설명 (vi 필수)" value={facts.description} onChange={(v) => set('description', v)} multiline />
        <LocalizedInputs label="서비스 지역" value={facts.service_area} onChange={(v) => set('service_area', v)} />
        <Form.Item label="same_as (줄바꿈 구분)">
          <Input.TextArea
            rows={3}
            value={facts.same_as.join('\n')}
            onChange={(e) => set('same_as', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          />
        </Form.Item>
        <Form.Item label="FAQ">
          <Space direction="vertical" style={{ width: '100%' }}>
            {facts.faq.map((f, i) => (
              <Card key={i} size="small" extra={<a onClick={() => set('faq', facts.faq.filter((_, idx) => idx !== i))}><MinusCircleOutlined /> 삭제</a>}>
                <LocalizedInputs label="질문" value={f.q} onChange={(v) => setFaq(i, 'q', v)} />
                <LocalizedInputs label="답변" value={f.a} onChange={(v) => setFaq(i, 'a', v)} multiline />
              </Card>
            ))}
            <Button icon={<PlusOutlined />} onClick={() => set('faq', [...facts.faq, { q: emptyLoc(), a: emptyLoc() }])}>
              FAQ 추가
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}

function DiagnoseCard({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl)
  useEffect(() => {
    if (!url && defaultUrl) setUrl(defaultUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultUrl])
  const [locale, setLocale] = useState<'ko-KR' | 'vi' | 'en'>('ko-KR')
  const diagnose = useFmDiagnose()
  const result = diagnose.data

  return (
    <Card title="사이트 진단">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input style={{ width: 360 }} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Select
          style={{ width: 110 }}
          value={locale}
          onChange={setLocale}
          options={['ko-KR', 'vi', 'en'].map((v) => ({ value: v, label: v }))}
        />
        <Button
          type="primary"
          loading={diagnose.isPending}
          disabled={!url.trim()}
          onClick={() => diagnose.mutate({ url: url.trim(), locale }, { onError: (e) => message.error(errMsg(e)) })}
        >
          진단 실행
        </Button>
      </Space>
      {result && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Tag className={`admin-status admin-status-${result.complete_reads ? 'success' : 'warning'}`}>
              {result.complete_reads ? '전체 읽기 완료' : '일부 읽기 실패'}
            </Tag>
            읽은 URL {result.reads.length}건
          </div>
          <Table<FmDiagnoseItem>
            size="small"
            pagination={false}
            rowKey="code"
            dataSource={result.items}
            columns={[
              { title: 'code', dataIndex: 'code', width: 160 },
              { title: '상태', dataIndex: 'state', width: 90, render: (s: FmDiagnoseItem['state']) => <Tag className={`admin-status admin-status-${DIAG_TONE[s]}`}>{s}</Tag> },
              { title: '항목', dataIndex: 'title' },
              { title: '문제', dataIndex: 'problem', render: (v?: string) => v ?? '-' },
              { title: '해결', dataIndex: 'fix', render: (v?: string) => v ?? '-' },
            ]}
          />
        </>
      )}
    </Card>
  )
}

const VISIT_DAY_OPTIONS = [7, 14, 30].map((d) => ({ value: d, label: `${d}일` }))
const AI_CHANNELS = ['Google AI Overviews', 'ChatGPT', 'Gemini', 'Perplexity', 'Cốc Cốc', 'Zalo AI']
const OTHER_CHANNEL = '__other'

type LogItem<B> = { id: number; body: B }

function BotVisitsCard() {
  const [days, setDays] = useState(14)
  const { data, isLoading, isError, error } = useFmVisits(days)
  const runJob = useFmRunJob()
  const run = (name: 'reverify' | 'refresh_bot_feeds') =>
    runJob.mutate(name, {
      onSuccess: (r) => (r.started === true || r.ok === true ? message.success(`실행 시작 — 결과는 잠시 후 표에 반영됩니다: ${r.job}`) : message.warning(`실행 결과 이상: ${r.job}`)),
      onError: (e) => message.error(errMsg(e)),
    })
  return (
    <Card title="봇 방문">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          VERIFIED만 IP·UA를 저장합니다(FactMind 원칙). 수집→색인→언급→인용→유입은 섞지 않고 따로 기록합니다.
        </Typography.Text>
        <Space wrap>
          <Select style={{ width: 100 }} value={days} onChange={setDays} options={VISIT_DAY_OPTIONS} />
          <Popconfirm title="published 전건을 재검증할까요?" onConfirm={() => run('reverify')}>
            <Button loading={runJob.isPending && runJob.variables === 'reverify'}>지금 재검증(published 전건)</Button>
          </Popconfirm>
          <Popconfirm title="봇 IP 피드를 갱신할까요?" onConfirm={() => run('refresh_bot_feeds')}>
            <Button loading={runJob.isPending && runJob.variables === 'refresh_bot_feeds'}>봇 IP 피드 갱신</Button>
          </Popconfirm>
        </Space>
        {isError && <Alert type="error" showIcon message="방문 기록을 불러오지 못했습니다." description={errMsg(error)} />}
        <Row gutter={16}>
          <Col span={8}><StatCard title="VERIFIED" value={data?.totals.VERIFIED ?? '-'} /></Col>
          <Col span={8}><StatCard title="UNVERIFIED" value={data?.totals.UNVERIFIED ?? '-'} /></Col>
          <Col span={8}><StatCard title="UNKNOWN" value={data?.totals.UNKNOWN ?? '-'} /></Col>
        </Row>
        <Table
          size="small"
          rowKey="date"
          loading={isLoading}
          pagination={false}
          dataSource={data?.daily ?? []}
          locale={{ emptyText: '아직 봇 방문 기록이 없습니다' }}
          columns={[
            { title: '날짜', dataIndex: 'date' },
            { title: 'VERIFIED', dataIndex: 'VERIFIED' },
            { title: 'UNVERIFIED', dataIndex: 'UNVERIFIED' },
            { title: 'UNKNOWN', dataIndex: 'UNKNOWN' },
          ]}
        />
        <Row gutter={16}>
          <Col span={12}>
            <Table
              size="small"
              rowKey={(r) => `${r.bot_id}:${r.verdict}`}
              pagination={false}
              dataSource={data?.by_bot ?? []}
              locale={{ emptyText: '-' }}
              columns={[
                { title: 'bot_id', dataIndex: 'bot_id' },
                { title: 'verdict', dataIndex: 'verdict' },
                { title: 'count', dataIndex: 'count' },
              ]}
            />
          </Col>
          <Col span={12}>
            <Table
              size="small"
              rowKey="path_kind"
              pagination={false}
              dataSource={data?.by_path_kind ?? []}
              locale={{ emptyText: '-' }}
              columns={[
                { title: '경로 종류', dataIndex: 'path_kind' },
                { title: 'count', dataIndex: 'count' },
              ]}
            />
          </Col>
        </Row>
      </Space>
    </Card>
  )
}

function ConsoleCoverageCard() {
  const { data, isLoading } = useFmConsoleCoverage()
  const add = useFmAddConsoleCoverage()
  const [form] = Form.useForm()
  const submit = (v: { source: FmConsoleCoverageInput['source']; observed_on: Dayjs; indexed?: number | null; discovered?: number | null; note?: string }) =>
    add.mutate(
      { source: v.source, observed_on: v.observed_on.format('YYYY-MM-DD'), indexed: v.indexed ?? null, discovered: v.discovered ?? null, note: v.note || null },
      {
        onSuccess: () => {
          message.success('저장되었습니다.')
          form.resetFields(['indexed', 'discovered', 'note'])
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  const items = (data?.items ?? []) as Array<LogItem<FmConsoleCoverageInput>>
  return (
    <Card title="검색 콘솔 색인 수(수기)">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">Search Console·Bing Webmaster 값을 주 1회 옮겨 적습니다.</Typography.Text>
        <Form form={form} layout="inline" onFinish={submit} initialValues={{ source: 'google', observed_on: dayjs() }} style={{ rowGap: 8 }}>
          <Form.Item name="source" rules={[{ required: true }]}>
            <Select style={{ width: 110 }} options={[{ value: 'google', label: 'google' }, { value: 'bing', label: 'bing' }]} />
          </Form.Item>
          <Form.Item name="observed_on" rules={[{ required: true }]}><DatePicker allowClear={false} /></Form.Item>
          <Form.Item name="indexed"><InputNumber min={0} placeholder="색인" /></Form.Item>
          <Form.Item name="discovered"><InputNumber min={0} placeholder="발견" /></Form.Item>
          <Form.Item name="note"><Input placeholder="메모" style={{ width: 200 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={add.isPending}>저장</Button></Form.Item>
        </Form>
        <Table<LogItem<FmConsoleCoverageInput>>
          size="small"
          rowKey="id"
          loading={isLoading}
          pagination={false}
          dataSource={items}
          locale={{ emptyText: '기록이 없습니다' }}
          columns={[
            { title: '날짜', render: (_, r) => r.body.observed_on },
            { title: '소스', render: (_, r) => r.body.source },
            { title: '색인', render: (_, r) => r.body.indexed ?? '-' },
            { title: '발견', render: (_, r) => r.body.discovered ?? '-' },
            { title: '메모', render: (_, r) => r.body.note ?? '-' },
          ]}
        />
      </Space>
    </Card>
  )
}

function AiProbeCard() {
  const { data, isLoading } = useFmAiProbes()
  const add = useFmAddAiProbe()
  const [form] = Form.useForm()
  const channelPick = Form.useWatch('channel', form)
  const submit = (v: { channel: string; channel_other?: string; question: string; mentioned: boolean; cited: boolean; observed_on: Dayjs; note?: string }) =>
    add.mutate(
      {
        channel: v.channel === OTHER_CHANNEL ? (v.channel_other ?? '').trim() : v.channel,
        question: v.question,
        mentioned: !!v.mentioned,
        cited: !!v.cited,
        observed_on: v.observed_on.format('YYYY-MM-DD'),
        note: v.note || null,
      },
      {
        onSuccess: () => {
          message.success('저장되었습니다.')
          form.resetFields(['question', 'mentioned', 'cited', 'note'])
        },
        onError: (e) => message.error(errMsg(e)),
      },
    )
  const items = (data?.items ?? []) as Array<LogItem<FmAiProbeInput>>
  return (
    <Card title="AI 채널 수동 프로브">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">로그아웃 브라우저에서 질문 세트를 1회 조회한 결과를 기록합니다(계획서 §5-5 결정 자료).</Typography.Text>
        <Form form={form} layout="inline" onFinish={submit} initialValues={{ observed_on: dayjs(), mentioned: false, cited: false }} style={{ rowGap: 8 }}>
          <Form.Item name="channel" rules={[{ required: true, message: '채널 선택' }]}>
            <Select
              placeholder="채널"
              style={{ width: 180 }}
              options={[...AI_CHANNELS.map((c) => ({ value: c, label: c })), { value: OTHER_CHANNEL, label: '기타(직접 입력)' }]}
            />
          </Form.Item>
          {channelPick === OTHER_CHANNEL && (
            <Form.Item name="channel_other" rules={[{ required: true, whitespace: true, message: '채널명 입력' }]}><Input placeholder="채널명" style={{ width: 140 }} /></Form.Item>
          )}
          <Form.Item name="question" rules={[{ required: true, message: '질문 입력' }]}><Input placeholder="질문" style={{ width: 260 }} /></Form.Item>
          <Form.Item name="mentioned" label="언급" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="cited" label="인용" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="observed_on" rules={[{ required: true }]}><DatePicker allowClear={false} /></Form.Item>
          <Form.Item name="note"><Input placeholder="메모" style={{ width: 200 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={add.isPending}>저장</Button></Form.Item>
        </Form>
        <Table<LogItem<FmAiProbeInput>>
          size="small"
          rowKey="id"
          loading={isLoading}
          pagination={false}
          dataSource={items}
          locale={{ emptyText: '기록이 없습니다' }}
          columns={[
            { title: '날짜', render: (_, r) => r.body.observed_on },
            { title: '채널', render: (_, r) => r.body.channel },
            { title: '질문', render: (_, r) => r.body.question },
            { title: '언급', render: (_, r) => (r.body.mentioned ? 'O' : 'X') },
            { title: '인용', render: (_, r) => (r.body.cited ? 'O' : 'X') },
            { title: '메모', render: (_, r) => r.body.note ?? '-' },
          ]}
        />
      </Space>
    </Card>
  )
}

function MeasurementSection() {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ marginBottom: 0 }}>측정</Typography.Title>
      <BotVisitsCard />
      <ConsoleCoverageCard />
      <AiProbeCard />
    </Space>
  )
}

export default function FactMindPage() {
  const [kind, setKind] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [q, setQ] = useState('')
  const { data, isLoading, isError, error } = useFmSubjects({ kind, status, q: q || undefined })
  const sync = useFmSync()
  const publish = useFmPublish()
  const verify = useFmVerify()
  const withdraw = useFmWithdraw()

  const items = data?.items ?? []
  const counts = data?.counts
  const platformUrl = items.find((r) => r.kind === 'platform')?.url
  const diagnoseDefault = platformUrl ? new URL(platformUrl).origin : ''

  const columns = [
    { title: '종류', dataIndex: 'kind', width: 90, render: (k: string) => <Tag>{k}</Tag> },
    { title: '이름', dataIndex: 'name' },
    {
      title: 'slug',
      dataIndex: 'slug',
      render: (s: string | null, r: FmSubjectRow) =>
        r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{s ?? '/l/'}</a>
        ) : (
          s ?? '-'
        ),
    },
    { title: '상태', dataIndex: 'status', width: 90, render: (s: FmSubjectStatus) => <StatusTag status={s} /> },
    { title: '구', dataIndex: 'ward_name', render: (v: string | null) => v ?? '-' },
    { title: '카테고리', dataIndex: 'category_code', render: (v: string | null) => v ?? '-' },
    { title: '발행', dataIndex: 'published_at', render: fmt },
    {
      title: '검증',
      dataIndex: 'verified_at',
      width: 170,
      render: (v: string | null, r: FmSubjectRow) => (
        <span>{r.verification_ok === null ? '-' : r.verification_ok ? '✓' : '✗'} {v ? fmt(v) : ''}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, r: FmSubjectRow) => (
        <Space size="small" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <a
            onClick={() =>
              publish.mutate(r.id, {
                onSuccess: (res) => message.success(`발행되었습니다: ${res.url}`),
                onError: (e) => message.error(errMsg(e)),
              })
            }
          >
            발행
          </a>
          {r.status === 'published' && (
            <a
              onClick={() =>
                verify.mutate(r.id, {
                  onSuccess: (res) => (res.ok ? message.success('검증 통과') : message.warning(`검증 실패 (문제 ${res.problems.length}건)`)),
                  onError: (e) => message.error(errMsg(e)),
                })
              }
            >
              검증
            </a>
          )}
          {r.status === 'published' && (
            <Popconfirm
              title="공개 페이지를 철회할까요?"
              onConfirm={() =>
                withdraw.mutate(r.id, {
                  onSuccess: () => message.success('철회되었습니다.'),
                  onError: (e) => message.error(errMsg(e)),
                })
              }
            >
              <a>철회</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>FactMind 공개 디렉터리</Typography.Title>
        <Typography.Text type="secondary">/b/&lt;slug&gt;/ · /l/ 공개 페이지를 발행·검증·철회합니다.</Typography.Text>
      </div>

      <Row gutter={16}>
        <Col span={8}><StatCard title="공개중" value={counts?.published ?? '-'} /></Col>
        <Col span={8}><StatCard title="검증 통과" value={counts?.verified ?? '-'} /></Col>
        <Col span={8}><StatCard title="철회" value={counts?.withdrawn ?? '-'} /></Col>
      </Row>

      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            loading={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (r) => {
                  const summary = `동기화 완료 — 생성 ${r.created}·갱신 ${r.updated}·발행 ${r.published}·자동철회 ${r.auto_withdrawn}·복귀 ${r.republished}`
                  if (r.errors > 0) message.warning(`${summary}·오류 ${r.errors}(서버 로그 확인)`)
                  else message.success(summary)
                },
                onError: (e) => message.error(errMsg(e)),
              })
            }
          >
            APPROVED 업체 동기화
          </Button>
          <Select allowClear placeholder="종류" style={{ width: 120 }} value={kind} onChange={setKind} options={[{ value: 'platform', label: 'platform' }, { value: 'business', label: 'business' }]} />
          <Select
            allowClear
            placeholder="상태"
            style={{ width: 120 }}
            value={status}
            onChange={setStatus}
            options={(Object.keys(STATUS_META) as FmSubjectStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))}
          />
          <Input.Search allowClear placeholder="이름 검색" style={{ width: 220 }} onSearch={setQ} />
        </Space>
        {isError && <Alert type="error" showIcon message="목록을 불러오지 못했습니다." description={errMsg(error)} />}
        <Table<FmSubjectRow>
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={items}
          columns={columns}
          pagination={false}
          scroll={{ x: 1100 }}
          expandable={{ expandRowByClick: true, expandedRowRender: (r) => <SubjectDetail id={r.id} /> }}
        />
        {data && <div style={{ marginTop: 8, color: '#64748b' }}>전체 {data.total}건 중 {items.length}건 표시</div>}
      </Card>

      <PlatformFactsCard />
      <DiagnoseCard defaultUrl={diagnoseDefault} />
      <MeasurementSection />
    </Space>
  )
}
