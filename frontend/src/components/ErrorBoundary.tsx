import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import styles from './ErrorBoundary.module.css';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 앱 루트를 감싸는 최후 방어선 — lazyWithRetry 가 청크 로드 실패를 자동 새로고침으로
 * 복구하지 못한 경우(이미 1회 새로고침했는데도 서버가 살아나지 않은 경우 등) 검은 화면
 * 대신 최소한의 안내와 다시 시도 버튼을 보여준다.
 */
class ErrorBoundaryImpl extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { t } = this.props;
    return (
      <div className={styles.block} role="alert">
        <span className={styles.emoji} aria-hidden="true">⚠️</span>
        <h1 className={styles.title}>{t('appError.title')}</h1>
        <p className={styles.body}>{t('appError.body')}</p>
        <Button size="md" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryImpl);
