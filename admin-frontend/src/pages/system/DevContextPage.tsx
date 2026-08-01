import { useState } from 'react'
import { Button, Input, Modal, Select, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import {
  useCreateDevFeature,
  useCreateDevTodo,
  useCycleDevContext,
  useCycleDevFeature,
  useCycleDevTodo,
  useDeleteDevContext,
  useDeleteDevFeature,
  useDeleteDevTodo,
  useDevContextList,
  useDevFeatures,
  useDevTodos,
  useUpsertDevContext,
  type DevContextRow,
  type DevFeature,
  type DevTodo,
} from '../../api/devContext'

const TODO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

function ContextSection() {
  const { data, isLoading } = useDevContextList()
  const upsert = useUpsertDevContext()
  const cycle = useCycleDevContext()
  const del = useDeleteDevContext()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const handleAdd = () => {
    if (!key.trim()) {
      message.warning('키를 입력하세요.')
      return
    }
    upsert.mutate(
      { key: key.trim(), value: value.trim() },
      {
        onSuccess: () => {
          message.success('저장되었습니다.')
          setKey('')
          setValue('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
      },
    )
  }

  const columns = [
    { title: '상태', dataIndex: 'status', key: 'status', width: 60 },
    { title: '키', dataIndex: 'key', key: 'key', render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '값', dataIndex: 'value', key: 'value' },
    { title: '수정일', dataIndex: 'updated_at', key: 'updated_at', width: 160, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: DevContextRow) => (
        <>
          <Button size="small" onClick={() => cycle.mutate(r.key)}>↻</Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() => Modal.confirm({ title: `[${r.key}]를 삭제할까요?`, onOk: () => del.mutate(r.key) })}
          >
            삭제
          </Button>
        </>
      ),
    },
  ]

  return (
    <div style={{ marginBottom: 32 }}>
      <h3>Context</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input style={{ width: 200 }} placeholder="키" value={key} onChange={(e) => setKey(e.target.value)} onPressEnter={handleAdd} />
        <Input style={{ width: 320 }} placeholder="값" value={value} onChange={(e) => setValue(e.target.value)} onPressEnter={handleAdd} />
        <Button type="primary" loading={upsert.isPending} onClick={handleAdd}>추가</Button>
      </div>
      <Table<DevContextRow> rowKey="key" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
    </div>
  )
}

function FeatureSection() {
  const { data, isLoading } = useDevFeatures()
  const create = useCreateDevFeature()
  const cycle = useCycleDevFeature()
  const del = useDeleteDevFeature()
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')

  const handleAdd = () => {
    if (!category.trim() || !name.trim()) {
      message.warning('카테고리와 이름을 입력하세요.')
      return
    }
    create.mutate(
      { category: category.trim(), name: name.trim() },
      {
        onSuccess: () => {
          message.success('추가되었습니다.')
          setCategory('')
          setName('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '추가에 실패했습니다.'),
      },
    )
  }

  const columns = [
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 160 },
    { title: '이름', dataIndex: 'name', key: 'name' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: DevFeature) => (
        <>
          <Button size="small" onClick={() => cycle.mutate(r.id)}>↻</Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() => Modal.confirm({ title: `[${r.name}]을 삭제할까요?`, onOk: () => del.mutate(r.id) })}
          >
            삭제
          </Button>
        </>
      ),
    },
  ]

  return (
    <div style={{ marginBottom: 32 }}>
      <h3>Features</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input style={{ width: 160 }} placeholder="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} onPressEnter={handleAdd} />
        <Input style={{ width: 320 }} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={handleAdd} />
        <Button type="primary" loading={create.isPending} onClick={handleAdd}>추가</Button>
      </div>
      <Table<DevFeature> rowKey="id" loading={isLoading} columns={columns} dataSource={data?.items ?? []} pagination={false} />
    </div>
  )
}

function TodoSection() {
  const { data, isLoading } = useDevTodos()
  const create = useCreateDevTodo()
  const cycle = useCycleDevTodo()
  const del = useDeleteDevTodo()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  const handleAdd = () => {
    if (!title.trim()) {
      message.warning('제목을 입력하세요.')
      return
    }
    create.mutate(
      { title: title.trim(), priority },
      {
        onSuccess: () => {
          message.success('추가되었습니다.')
          setTitle('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '추가에 실패했습니다.'),
      },
    )
  }

  const columns = [
    { title: '우선순위', dataIndex: 'priority', key: 'priority', width: 100 },
    { title: '제목', dataIndex: 'title', key: 'title' },
    {
      title: '기능',
      key: 'feature',
      width: 160,
      render: (_: unknown, r: DevTodo) => r.feature?.name ?? '-',
    },
    { title: '상태', dataIndex: 'status', key: 'status', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: DevTodo) => (
        <>
          <Button size="small" onClick={() => cycle.mutate(r.id)}>↻</Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() => Modal.confirm({ title: `[${r.title}]을 삭제할까요?`, onOk: () => del.mutate(r.id) })}
          >
            삭제
          </Button>
        </>
      ),
    },
  ]

  return (
    <div>
      <h3>Todos</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input style={{ width: 320 }} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} onPressEnter={handleAdd} />
        <Select style={{ width: 140 }} value={priority} onChange={setPriority} options={TODO_PRIORITIES.map((p) => ({ value: p, label: p }))} />
        <Button type="primary" loading={create.isPending} onClick={handleAdd}>추가</Button>
      </div>
      <Table<DevTodo> rowKey="id" loading={isLoading} columns={columns} dataSource={data?.items ?? []} pagination={false} />
    </div>
  )
}

export default function DevContextPage() {
  return (
    <>
      <ContextSection />
      <FeatureSection />
      <TodoSection />
    </>
  )
}
