/** fetch 래퍼 — same-origin 쿠키(admin_session), 401 시 로그인 이동, JSON 파싱·에러 정규화. */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const LOGIN_PATH = '/admin/login'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (res.status === 401) {
    // 세션 만료 — 로그인 화면으로. (로그인 화면 자체의 401 은 폼 에러로 처리)
    if (!window.location.pathname.startsWith(LOGIN_PATH)) {
      window.location.href = LOGIN_PATH
    }
    throw new ApiError(401, '로그인이 필요합니다.')
  }

  if (!res.ok) {
    let detail = `요청 실패 (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // JSON 아님 — 기본 메시지 유지
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
