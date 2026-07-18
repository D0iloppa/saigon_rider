import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
          Saigon Rider 관리자
        </Typography.Title>
        {mutation.isError && (
          <Alert type="error" message="아이디 또는 비밀번호가 올바르지 않습니다." style={{ marginBottom: 16 }} />
        )}
        <Form<LoginForm> layout="vertical" onFinish={(values) => mutation.mutate(values)}>
          <Form.Item name="username" label="아이디" rules={[{ required: true, message: '아이디를 입력하세요' }]}>
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="비밀번호" rules={[{ required: true, message: '비밀번호를 입력하세요' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={mutation.isPending}>
            로그인
          </Button>
        </Form>
      </Card>
    </div>
  )
}
