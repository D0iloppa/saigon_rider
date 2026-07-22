import { Button, Result } from 'antd'
import { Component, type ReactNode } from 'react'

/** 라우트 렌더링 중 발생한 에러를 잡아 전체 화면 백지화 대신 에러 패널을 보여준다. resetKey 가 바뀌면(예: 경로 이동) 자동으로 복구한다. */
export default class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown },
  { error: Error | null; resetKey?: unknown }
> {
  state: { error: Error | null; resetKey?: unknown } = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(
    props: { resetKey?: unknown },
    state: { error: Error | null; resetKey?: unknown },
  ) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('ErrorBoundary caught render error:', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="화면을 표시하는 중 오류가 발생했습니다"
          subTitle={this.state.error.message}
          extra={[
            <Button key="retry" type="primary" onClick={this.handleRetry}>다시 시도</Button>,
            <Button key="reload" onClick={() => window.location.reload()}>페이지 새로고침</Button>,
          ]}
        />
      )
    }
    return this.props.children
  }
}
