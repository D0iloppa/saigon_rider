import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Form, Input } from 'antd'
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'

interface LoginForm {
  username: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => login(values.username, values.password),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="login-page">
      <div className="login-overlay" />
      <header className="login-brandbar">
        <a href="https://www.saigon-rider.com/" target="_blank" rel="noopener noreferrer" aria-label="Saigon Rider 공식 사이트(새 창)">
          <img src="/admin/saigon-rider-logo.png" alt="" />
          <span>SAIGON RIDER</span>
        </a>
        <span>OPERATIONS CONSOLE</span>
      </header>
      <main className="login-stage">
        <section className="login-hero-copy">
          <div className="login-eyebrow"><span /> SAIGON RIDER ADMINISTRATION</div>
          <h1>도시의 모든 라이드를<br />더 안전하게.</h1>
          <p>사이공 라이더의 사용자, 거래, 콘텐츠와 지역 정보를 한곳에서 관리하는 운영 콘솔입니다.</p>
          <a href="https://www.saigon-rider.com/" target="_blank" rel="noopener noreferrer">서비스 알아보기 <ArrowRightOutlined /></a>
        </section>
        <div className="login-panel">
          <div className="login-intro"><span>관리자 전용</span><strong>운영 콘솔 로그인</strong><p>승인된 관리자 계정으로 접속해 주세요.</p></div>
          <Card>
            {mutation.isError && (
              <Alert type="error" message="아이디 또는 비밀번호가 올바르지 않습니다." style={{ marginBottom: 16 }} />
            )}
            <Form<LoginForm> layout="vertical" onFinish={(values) => mutation.mutate(values)} requiredMark={false}>
              <Form.Item name="username" label="아이디" rules={[{ required: true, message: '아이디를 입력하세요' }]}>
                <Input prefix={<UserOutlined />} placeholder="관리자 아이디" autoComplete="username" autoFocus />
              </Form.Item>
              <Form.Item name="password" label="비밀번호" rules={[{ required: true, message: '비밀번호를 입력하세요' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="비밀번호" autoComplete="current-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={mutation.isPending}>
                로그인 <ArrowRightOutlined />
              </Button>
            </Form>
          </Card>
          <div className="login-security">AUTHORIZED PERSONNEL ONLY · 접속 기록이 보안 로그에 저장됩니다.</div>
        </div>
      </main>
    </div>
  )
}
