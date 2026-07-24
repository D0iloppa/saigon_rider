import { Tabs } from 'antd'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DailyFeaturedPage from '../sre/DailyFeaturedPage'
import GachaListPage from '../sre/GachaListPage'
import ItemListPage from '../sre/ItemListPage'
import OpsDashboardPage from '../sre/OpsDashboardPage'
import PushPage from '../sre/PushPage'
import QuestListPage from '../sre/QuestListPage'
import RewardPolicyPage from '../sre/RewardPolicyPage'
import ShopListPage from '../sre/ShopListPage'
import StreamPage from '../sre/StreamPage'

const TABS = [
  { key: 'ops', label: '운영 현황', children: <OpsDashboardPage /> },
  { key: 'reward-policies', label: '보상 정책', children: <RewardPolicyPage /> },
  { key: 'items', label: '아이템', children: <ItemListPage /> },
  { key: 'quests', label: '퀘스트', children: <QuestListPage /> },
  { key: 'gacha', label: '가챠', children: <GachaListPage /> },
  { key: 'shop', label: '상점', children: <ShopListPage /> },
  { key: 'daily-featured', label: '일일 추천', children: <DailyFeaturedPage /> },
  { key: 'push', label: '푸시', children: <PushPage /> },
  { key: 'stream', label: '스트림', children: <StreamPage /> },
]

const TAB_KEYS = new Set(TABS.map((tab) => tab.key))

export default function EngineSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') ?? 'ops'
  const activeTab = TAB_KEYS.has(requestedTab) ? requestedTab : 'ops'

  useEffect(() => {
    if (searchParams.get('tab') === activeTab) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', activeTab)
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  const changeTab = (tab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  return <Tabs activeKey={activeTab} items={TABS} onChange={changeTab} destroyInactiveTabPane />
}
