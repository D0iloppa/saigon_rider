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
  status: 'REVIEWING' | 'RESOLVED' | 'REJECTED' | 'CANCELLED';
  created_at: string;
  handled_at: string | null;
  listing_id: string | null;
  target_title: string | null;
  target_thumbnail_url: string | null;
  // R-3(260817 §12-B) — 서버가 계산해 내려주는 취소 가능 여부. 원본 status(PENDING 등)는 노출 안 함.
  can_cancel: boolean;
  // R-1(260819 W3) — 신고자 본인이 남긴 코멘트/첨부사진(타인 정보 아님, 노출 무해).
  note: string | null;
  images: string[];
  // R-2(260819 W3) — resolution_note(내부 메모) 원본이 아니라 공개용 요약만.
  resolution_summary: string | null;
}

export async function fetchReports(): Promise<Report[]> {
  return api.realFetch<Report[]>('/support/reports');
}

// R-3(260817 §12-B) — 신고 취소. 소유권 위반은 404, 취소불가(REVIEWING 이상)는 409 로 온다 —
// 호출부가 사람이 읽을 문구를 직접 띄우므로 rethrow:true 필수(중복 토스트 규약).
export async function cancelReport(id: string): Promise<Report> {
  return api.realFetch<Report>(`/support/reports/${id}`, { method: 'DELETE' }, 'bff', { rethrow: true });
}
