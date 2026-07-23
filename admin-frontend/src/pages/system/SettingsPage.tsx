import { useEffect, useState } from 'react'
import { Alert, Avatar, Button, Card, Checkbox, Input, InputNumber, Select, Skeleton, Space, Table, Tabs, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useMe } from '../../App'
import {
  useAppVersions,
  useCreateAppVersion,
  useCreateNicknameWord,
  useDeleteAppVersion,
  useDeleteNicknameWord,
  useNicknameWords,
  useProfile,
  useServiceConfig,
  useUpdateProfileAvatar,
  useUpdateProfileNickname,
  useUpdateServiceConfig,
  type AppVersion,
  type NicknameWord,
  type NicknameWordType,
} from '../../api/settings'

function ProfileTab() {
  const { data, isLoading, isError, error } = useProfile()
  const updateNickname = useUpdateProfileNickname()
  const updateAvatar = useUpdateProfileAvatar()
  const [nickname, setNickname] = useState('')
  const [avatarContentId, setAvatarContentId] = useState('')

  useEffect(() => {
    if (data) {
      setNickname(data.nickname ?? '')
      setAvatarContentId(data.avatar_content_id ?? '')
    }
  }, [data])

  if (isError) {
    return <Alert type="error" showIcon message="프로필을 불러오지 못했습니다." description={error instanceof Error ? error.message : undefined} />
  }
  if (isLoading || !data) {
    return <Skeleton active paragraph={{ rows: 4 }} />
  }

  const handleSaveNickname = () => {
    const trimmed = nickname.trim()
    if (!trimmed) {
      message.warning('닉네임을 입력하세요.')
      return
    }
    if (trimmed.length > 30) {
      message.warning('닉네임은 30자 이하여야 합니다.')
      return
    }
    updateNickname.mutate(trimmed, {
      onSuccess: () => message.success('닉네임이 변경되었습니다.'),
      onError: (err) => message.error(err instanceof Error ? err.message : '변경에 실패했습니다.'),
    })
  }

  const handleSaveAvatar = () => {
    updateAvatar.mutate(avatarContentId.trim() || null, {
      onSuccess: () => message.success('프로필 이미지가 변경되었습니다.'),
      onError: (err) => message.error(err instanceof Error ? err.message : '변경에 실패했습니다.'),
    })
  }

  return (
    <Space direction="vertical" size={24} style={{ display: 'flex' }}>
      <Space size={16} align="center">
        <Avatar size={64} src={data.avatar_url} />
        <Space direction="vertical" size={4}>
          <Typography.Text type="secondary">프로필 이미지 (콘텐츠 UUID)</Typography.Text>
          <Space>
            <Input
              style={{ width: 320 }}
              placeholder="content_id (UUID)"
              value={avatarContentId}
              onChange={(e) => setAvatarContentId(e.target.value)}
            />
            <Button loading={updateAvatar.isPending} onClick={handleSaveAvatar}>
              저장
            </Button>
          </Space>
        </Space>
      </Space>
      <div>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          닉네임 (관리자 공용 계정)
        </Typography.Text>
        <Space>
          <Input style={{ width: 240 }} maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <Button type="primary" loading={updateNickname.isPending} onClick={handleSaveNickname}>
            저장
          </Button>
        </Space>
      </div>
    </Space>
  )
}

function NicknameWordTab() {
  const { data, isLoading, isError, error } = useNicknameWords()
  const createWord = useCreateNicknameWord()
  const deleteWord = useDeleteNicknameWord()
  const [word, setWord] = useState('')
  const [wordType, setWordType] = useState<NicknameWordType>('adjective')

  if (isError) {
    return <Alert type="error" showIcon message="닉네임 단어사전을 불러오지 못했습니다." description={error instanceof Error ? error.message : undefined} />
  }

  const handleAdd = () => {
    const trimmed = word.trim()
    if (!trimmed) {
      message.warning('단어를 입력하세요.')
      return
    }
    createWord.mutate(
      { word: trimmed, word_type: wordType },
      {
        onSuccess: () => {
          message.success('단어가 추가되었습니다.')
          setWord('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '추가에 실패했습니다.'),
      }
    )
  }

  const columns = [
    { title: '단어', dataIndex: 'word', key: 'word' },
    {
      title: '유형',
      dataIndex: 'word_type',
      key: 'word_type',
      render: (v: NicknameWordType) => (v === 'adjective' ? '형용사' : '명사'),
    },
    { title: '등록일', dataIndex: 'created_at', key: 'created_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, r: NicknameWord) => (
        <Button
          size="small"
          danger
          onClick={() => deleteWord.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') })}
        >
          삭제
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Space>
        <Select
          style={{ width: 120 }}
          value={wordType}
          onChange={setWordType}
          options={[
            { value: 'adjective', label: '형용사' },
            { value: 'noun', label: '명사' },
          ]}
        />
        <Input style={{ width: 240 }} placeholder="단어" value={word} onChange={(e) => setWord(e.target.value)} onPressEnter={handleAdd} />
        <Button type="primary" loading={createWord.isPending} onClick={handleAdd}>
          추가
        </Button>
      </Space>
      <Table<NicknameWord>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '등록된 단어가 없습니다.' }}
      />
    </Space>
  )
}

function AppVersionTab() {
  const { data, isLoading, isError, error } = useAppVersions()
  const createVersion = useCreateAppVersion()
  const deleteVersion = useDeleteAppVersion()
  const [version, setVersion] = useState('')
  const [iosBuild, setIosBuild] = useState('')
  const [androidBuild, setAndroidBuild] = useState('')
  const [releaseNote, setReleaseNote] = useState('')
  const [isForceUpdate, setIsForceUpdate] = useState(false)
  const [isActive, setIsActive] = useState(false)

  if (isError) {
    return <Alert type="error" showIcon message="앱 버전 목록을 불러오지 못했습니다." description={error instanceof Error ? error.message : undefined} />
  }

  const handleAdd = () => {
    const trimmed = version.trim()
    if (!trimmed) {
      message.warning('버전을 입력하세요.')
      return
    }
    createVersion.mutate(
      {
        version: trimmed,
        ios_build: iosBuild.trim(),
        android_build: androidBuild.trim(),
        release_note: releaseNote.trim(),
        is_force_update: isForceUpdate,
        is_active: isActive,
      },
      {
        onSuccess: () => {
          message.success('버전이 등록되었습니다.')
          setVersion('')
          setIosBuild('')
          setAndroidBuild('')
          setReleaseNote('')
          setIsForceUpdate(false)
          setIsActive(false)
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '등록에 실패했습니다.'),
      }
    )
  }

  const columns = [
    {
      title: '버전',
      key: 'version',
      render: (_: unknown, r: AppVersion) => (
        <>
          {r.is_active ? '● ' : '○ '}
          {r.version}
          {r.is_force_update ? ' [강제]' : ''}
        </>
      ),
    },
    { title: 'iOS 빌드', dataIndex: 'ios_build', key: 'ios_build', render: (v: string | null) => v ?? '-' },
    { title: 'Android 빌드', dataIndex: 'android_build', key: 'android_build', render: (v: string | null) => v ?? '-' },
    { title: '릴리즈 노트', dataIndex: 'release_note', key: 'release_note', render: (v: string | null) => v ?? '-' },
    {
      title: '배포일',
      dataIndex: 'released_at',
      key: 'released_at',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '미배포'),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, r: AppVersion) => (
        <Button
          size="small"
          danger
          onClick={() => deleteVersion.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') })}
        >
          삭제
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Space wrap>
        <Input style={{ width: 120 }} placeholder="버전 (1.0.0)" value={version} onChange={(e) => setVersion(e.target.value)} />
        <Input style={{ width: 140 }} placeholder="iOS 빌드" value={iosBuild} onChange={(e) => setIosBuild(e.target.value)} />
        <Input style={{ width: 140 }} placeholder="Android 빌드" value={androidBuild} onChange={(e) => setAndroidBuild(e.target.value)} />
        <Input style={{ width: 240 }} placeholder="릴리즈 노트" value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} />
        <Checkbox checked={isForceUpdate} onChange={(e) => setIsForceUpdate(e.target.checked)}>
          강제 업데이트
        </Checkbox>
        <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)}>
          활성화
        </Checkbox>
        <Button type="primary" loading={createVersion.isPending} onClick={handleAdd}>
          등록
        </Button>
      </Space>
      <Table<AppVersion>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '등록된 버전이 없습니다.' }}
      />
    </Space>
  )
}

function ServiceConfigTab() {
  const { data, isLoading, isError, error } = useServiceConfig()
  const updateConfig = useUpdateServiceConfig()
  const [dmPollInterval, setDmPollInterval] = useState<number | null>(null)

  useEffect(() => {
    if (data) setDmPollInterval(Number(data.dm_poll_interval))
  }, [data])

  if (isError) {
    return <Alert type="error" showIcon message="서비스 설정을 불러오지 못했습니다." description={error instanceof Error ? error.message : undefined} />
  }
  if (isLoading || !data) {
    return <Skeleton active paragraph={{ rows: 2 }} />
  }

  const handleSave = () => {
    if (dmPollInterval === null || dmPollInterval < 10 || dmPollInterval > 300) {
      message.warning('설정값이 올바르지 않습니다 (10~300).')
      return
    }
    updateConfig.mutate(
      { dm_poll_interval: String(dmPollInterval) },
      {
        onSuccess: () => message.success('서비스 설정이 저장되었습니다.'),
        onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
      }
    )
  }

  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        DM 미읽음 폴링 주기 (초, 10~300)
      </Typography.Text>
      <Space>
        <InputNumber style={{ width: 180 }} min={10} max={300} value={dmPollInterval} onChange={setDmPollInterval} />
        <Button type="primary" loading={updateConfig.isPending} onClick={handleSave}>
          저장
        </Button>
      </Space>
    </div>
  )
}

export default function SettingsPage() {
  const me = useMe()
  const isPrivileged = me.role === 'root' || me.role === 'admin'

  const items = [
    { key: 'profile', label: '프로필', children: <ProfileTab /> },
    { key: 'nickname-words', label: '닉네임 단어사전', children: <NicknameWordTab /> },
    ...(isPrivileged
      ? [
          { key: 'versions', label: '앱 버전 관리', children: <AppVersionTab /> },
          { key: 'service-config', label: '서비스 설정', children: <ServiceConfigTab /> },
        ]
      : []),
  ]

  return (
    <Card>
      <Tabs items={items} />
    </Card>
  )
}
