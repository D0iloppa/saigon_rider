import { api } from './client';

export interface NoticeItem {
  id: number;
  title: string;
  is_pinned: boolean;
  published_at: string | null;
}

export interface NoticeDetail extends NoticeItem {
  body: string;
}

export interface FaqItem {
  id: number;
  category: string;
  question: string;
  answer: string;
}

export async function fetchNotices(lang: string): Promise<NoticeItem[]> {
  return api.realFetch<NoticeItem[]>(`/notices?lang=${lang}`);
}

export async function fetchNotice(id: string, lang: string): Promise<NoticeDetail> {
  return api.realFetch<NoticeDetail>(`/notices/${id}?lang=${lang}`);
}

export async function fetchFaqs(lang: string): Promise<FaqItem[]> {
  return api.realFetch<FaqItem[]>(`/faqs?lang=${lang}`);
}
