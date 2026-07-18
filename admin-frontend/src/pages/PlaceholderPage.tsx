import { Card, Typography } from 'antd'

/** 후속 패키지(P2·P3·P5·P6)에서 실제 페이지로 교체되는 자리표시자. */
export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card>
      <Typography.Title level={4}>{title}</Typography.Title>
      <Typography.Text type="secondary">준비 중입니다.</Typography.Text>
    </Card>
  )
}
