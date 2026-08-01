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
