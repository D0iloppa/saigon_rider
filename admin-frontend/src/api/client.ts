/** fetch 래퍼 — same-origin 쿠키(admin_session), 401 시 로그인 이동, JSON 파싱·에러 정규화. */

/** 백엔드 공통 페이지네이션 응답(schemas.Page) 미러. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** undefined/빈 문자열 값은 생략하는 쿼리스트링 빌더. */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

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

/** multipart 업로드 전용 — `api()`와 달리 Content-Type 을 지정하지 않는다(FormData 가 boundary 를
 * 포함한 헤더를 스스로 세팅해야 하므로). 인증·401·에러 처리는 `api()`와 동일하게 맞춘다. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: form })

  if (res.status === 401) {
    if (!window.location.pathname.startsWith(LOGIN_PATH)) {
      window.location.href = LOGIN_PATH
    }
    throw new ApiError(401, '로그인이 필요합니다.')
  }

  if (!res.ok) {
    let detail = `업로드 실패 (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // JSON 아님 — 기본 메시지 유지
    }
    throw new ApiError(res.status, detail)
  }

  return (await res.json()) as T
}
