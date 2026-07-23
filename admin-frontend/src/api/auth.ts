import { api } from './client'

export interface Me {
  username: string
  role: 'root' | 'admin' | 'manager'
}

export function login(username: string, password: string): Promise<Me> {
  return api<Me>('/admin/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return api<void>('/admin/api/auth/logout', { method: 'POST' })
}

export function fetchMe(): Promise<Me> {
  return api<Me>('/admin/api/auth/me')
}
