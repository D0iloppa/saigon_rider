import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import clsx from 'clsx';
import styles from './index.module.css';

interface ServiceCardProps {
  icon: string;
  title: string;
  desc: string;
  href: string;
  badge: 'public' | 'private' | 'internal';
  badgeLabel: string;
}

function ServiceCard({icon, title, desc, href, badge, badgeLabel}: ServiceCardProps) {
  return (
    <a href={href} className="service-card">
      <div className="service-card__icon">{icon}</div>
      <div className="service-card__title">{title}</div>
      <div className="service-card__desc">{desc}</div>
      <span className={clsx('service-card__badge', `badge--${badge}`)}>{badgeLabel}</span>
    </a>
  );
}

// href는 모두 루트 기준 절대경로 사용
// nginx가 동일 호스트(포트 80/443)에서 서빙하므로 hostname 하드코딩 불필요
const SERVICES: ServiceCardProps[] = [
  {
    icon: '📱',
    title: 'Frontend App',
    desc: 'React + Vite SPA. Capacitor 네이티브 앱 셸. 메인 사용자 인터페이스.',
    href: '/',
    badge: 'public',
    badgeLabel: 'Public',
  },
  {
    icon: '⚡',
    title: 'BFF API (Swagger UI)',
    desc: 'FastAPI 기반 Backend-for-Frontend. 모든 엔드포인트를 인터랙티브하게 테스트 가능.',
    href: '/api/docs',
    badge: 'private',
    badgeLabel: 'Dev Only',
  },
  {
    icon: '📖',
    title: 'BFF API (ReDoc)',
    desc: '읽기 전용 API 레퍼런스 문서. 클라이언트 통합 시 참조용.',
    href: '/api/redoc',
    badge: 'private',
    badgeLabel: 'Dev Only',
  },
  {
    icon: '🛡️',
    title: 'Admin Console',
    desc: '운영자 관리 콘솔. 사용자·콘텐츠·퀘스트 관리.',
    href: '/admin/login',
    badge: 'private',
    badgeLabel: 'Auth Required',
  },
  {
    icon: '🏎️',
    title: 'SRE Engine',
    desc: '포인트 적립·차감·리워드 계산 엔진. Docker 내부 네트워크 전용.',
    href: '/engine/',
    badge: 'internal',
    badgeLabel: 'Internal Only',
  },
  {
    icon: '🖼️',
    title: 'Imgproxy',
    desc: '이미지 리사이즈·변환·WebP 서빙. /img/insecure/{options}/plain/local:///...',
    href: '/img/',
    badge: 'internal',
    badgeLabel: 'Internal Only',
  },
];

function HeroSection() {
  return (
    <header className={clsx('hero hero--primary hero--wiki')}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          🏍️ Saigon Rider Dev Wiki
        </Heading>
        <p className="hero__subtitle">
          개발자 포털 — 서비스 현황, API 레퍼런스, 아키텍처 문서
        </p>
        <div>
          <a className="button button--secondary button--lg" href="docs/intro">
            시작하기 →
          </a>
        </div>
      </div>
    </header>
  );
}

export default function Home(): React.JSX.Element {
  return (
    <Layout title="Dev Wiki" description="Saigon Rider Developer Portal">
      <HeroSection />
      <main>
        <div className="container" style={{paddingTop: '2rem', paddingBottom: '3rem'}}>
          <Heading as="h2">서비스 일람</Heading>
          <p>각 카드를 클릭하면 해당 서비스로 이동합니다. 상대 경로 기반이므로 동일 호스트의 서비스를 통합 탐색할 수 있습니다.</p>

          <div className="service-grid">
            {SERVICES.map((s) => (
              <ServiceCard key={s.title} {...s} />
            ))}
          </div>

          <div style={{marginTop: '2.5rem'}}>
            <Heading as="h2">배지 범례</Heading>
            <table>
              <thead>
                <tr>
                  <th>배지</th>
                  <th>의미</th>
                  <th>접근 권한</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="service-card__badge badge--public">Public</span></td>
                  <td>공개 서비스</td>
                  <td>누구나 접근 가능</td>
                </tr>
                <tr>
                  <td><span className="service-card__badge badge--private">Dev Only / Auth Required</span></td>
                  <td>개발자·운영자 전용</td>
                  <td>Nginx Basic Auth 또는 앱 인증</td>
                </tr>
                <tr>
                  <td><span className="service-card__badge badge--internal">Internal Only</span></td>
                  <td>내부 네트워크 전용</td>
                  <td>Docker 내부망만 접근 (외부 차단)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{marginTop: '2.5rem'}}>
            <Heading as="h2">경로 구성</Heading>
            <table>
              <thead>
                <tr><th>서비스</th><th>경로</th><th>비고</th></tr>
              </thead>
              <tbody>
                <tr><td>Frontend App</td><td><a href="/">/</a></td><td>메인 SPA</td></tr>
                <tr><td>BFF API</td><td><a href="/api/health">/api/</a></td><td>REST API</td></tr>
                <tr><td>Swagger UI</td><td><a href="/api/docs">/api/docs</a></td><td>인터랙티브 API 문서</td></tr>
                <tr><td>Admin Console</td><td><a href="/admin/login">/admin/</a></td><td>운영자 콘솔</td></tr>
                <tr><td>Developer Wiki</td><td><a href="/wiki/">/wiki/</a></td><td>현재 페이지</td></tr>
                <tr><td>Imgproxy</td><td>/img/</td><td>이미지 처리</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </Layout>
  );
}
