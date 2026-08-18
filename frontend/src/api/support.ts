import { api } from './client';

export interface SupportTicket {
  id: string;
  title: string;
  body: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  has_unread_reply: boolean;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupportReply {
  id: number;
  author_type: 'user' | 'admin';
  body: string;
  created_at: string;
}

export interface SupportTicketDetail extends SupportTicket {
  replies: SupportReply[];
}

export async function fetchTickets(): Promise<SupportTicket[]> {
  return api.realFetch<SupportTicket[]>('/support/tickets');
}

export async function fetchTicket(id: string): Promise<SupportTicketDetail> {
  return api.realFetch<SupportTicketDetail>(`/support/tickets/${id}`);
}

export async function createTicket(title: string, body: string): Promise<SupportTicket> {
  return api.realFetch<SupportTicket>('/support/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
}

// R-1(260817 §12-B) — 내 신고 목록 (조회 전용). status 는 서버가 이미 REVIEWING/RESOLVED/REJECTED
// 3단계로 뭉갠 값만 내려준다 — result_code/resolution_note 원본은 응답에 없음.
export interface Report {
  id: string;
  target_type: 'LISTING' | 'USER' | 'DM' | 'POST' | 'COMMENT';
  reason: string;
  status: 'REVIEWING' | 'RESOLVED' | 'REJECTED';
  created_at: string;
  handled_at: string | null;
  listing_id: string | null;
  target_title: string | null;
  target_thumbnail_url: string | null;
}

export async function fetchReports(): Promise<Report[]> {
  return api.realFetch<Report[]>('/support/reports');
}
