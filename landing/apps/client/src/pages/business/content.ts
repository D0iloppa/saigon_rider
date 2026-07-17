import type { Locale } from "@/lib/locale";

export type { Locale };
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABEL, resolveLocale, localePath } from "@/lib/locale";

interface StepCopy {
  step: string;
  title: string;
  body: string;
}

interface CardCopy {
  title: string;
  body: string;
}

interface BusinessCopy {
  nav: { how: string; app: string; start: string };
  hero: { kicker: string; heading: string; lead: string; ctaPrimary: string; ctaSecondary: string };
  howHead: { kicker: string; heading: string };
  how: StepCopy[];
  benefitsHead: { kicker: string; heading: string };
  benefits: CardCopy[];
  showcase: { heading: string; body: string; cta: string };
  ctaBand: { heading: string; cta: string };
  footer: { tagline: string; nav: { how: string; app: string; privacy: string; contact: string }; bottomLine: string };
}

export const content: Record<Locale, BusinessCopy> = {
  vi: {
    nav: { how: "Tính năng", app: "Ứng dụng Saigon Rider", start: "Bắt đầu ngay" },
    hero: {
      kicker: "Saigon Rider Doanh nghiệp",
      heading: "Giới thiệu quán của bạn<br />đến tài xế khu phố",
      lead: "Bản đồ khu phố và bảng tin của Saigon Rider là màn hình hàng xóm xem mỗi ngày. Tạo hồ sơ doanh nghiệp và đăng tin, khách hàng thật trong khu phố sẽ tìm đến quán bạn.",
      ctaPrimary: "Liên hệ ngay",
      ctaSecondary: "Xem cách hoạt động",
    },
    howHead: { kicker: "Cách hoạt động", heading: "Chỉ cần ba bước" },
    how: [
      { step: "01", title: "Tạo hồ sơ doanh nghiệp", body: "Đăng thông tin và hình ảnh quán, sẵn sàng để đăng tin." },
      { step: "02", title: "Đội ngũ kiểm duyệt", body: "Mọi quảng cáo đều qua kiểm duyệt trước khi hiển thị, chỉ thông tin tin cậy mới đến với hàng xóm." },
      { step: "03", title: "Xuất hiện trên bản đồ & bảng tin", body: "Tin đã kiểm duyệt tự nhiên xuất hiện trên ghim bản đồ khu phố và bảng tin cộng đồng." },
    ],
    benefitsHead: { kicker: "Khác biệt của Saigon Rider Doanh nghiệp", heading: "Kết nối trực tiếp với tài xế khu phố" },
    benefits: [
      { title: "Khách hàng khu phố thật", body: "Hiển thị theo vị trí đến đúng tài xế đang ở khu phố của bạn." },
      { title: "Quảng cáo qua kiểm duyệt", body: "Mọi quảng cáo được đội ngũ vận hành kiểm duyệt, giữ vững sự tin cậy của hàng xóm." },
      { title: "Xuất hiện trên cả bản đồ & bảng tin", body: "Gặp khách hàng đồng thời qua ghim bản đồ khu phố và bảng tin cộng đồng." },
      { title: "Giữ khách quen bằng tin tức", body: "Đăng tin giảm giá, sự kiện, và giữ liên kết với hàng xóm qua đánh giá." },
    ],
    showcase: {
      heading: "Đúng như hàng xóm nhìn thấy,<br />tin quán bạn sống động trên bản đồ",
      body: "Khi hàng xóm mở bản đồ khu phố, ghim quán và tin mới nhất của bạn tự nhiên đập vào mắt.",
      cta: "Bắt đầu ngay",
    },
    ctaBand: { heading: "Giới thiệu quán của bạn<br />đến tài xế khu phố ngay hôm nay", cta: "Liên hệ ngay" },
    footer: {
      tagline: "Saigon Rider Doanh nghiệp — cách nhanh nhất để giới thiệu quán đến tài xế khu phố",
      nav: { how: "Cách hoạt động", app: "Ứng dụng Saigon Rider", privacy: "Chính sách bảo mật", contact: "Liên hệ" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
  ko: {
    nav: { how: "기능 소개", app: "사이공라이더 앱", start: "비즈니스 시작하기" },
    hero: {
      kicker: "사이공라이더 비즈니스",
      heading: "동네 라이더에게<br />가게를 알리세요",
      lead: "사이공라이더의 동네지도와 피드는 매일 이웃들이 들여다보는 화면입니다. 비즈프로필을 만들고 소식을 올리면, 진짜 동네 손님이 가게를 찾아옵니다.",
      ctaPrimary: "문의하기",
      ctaSecondary: "이용 방법 보기",
    },
    howHead: { kicker: "이용 방법", heading: "세 단계면 충분합니다" },
    how: [
      { step: "01", title: "비즈프로필 만들기", body: "가게 정보와 사진을 등록하고 소식을 올릴 준비를 마칩니다." },
      { step: "02", title: "운영진 심사", body: "모든 광고는 게재 전 심사를 거쳐, 이웃에게 신뢰할 수 있는 정보만 노출됩니다." },
      { step: "03", title: "동네지도 · 피드 노출", body: "심사를 통과한 소식은 동네지도 핀과 커뮤니티 피드에 자연스럽게 노출됩니다." },
    ],
    benefitsHead: { kicker: "사이공라이더 비즈니스가 다른 점", heading: "동네 라이더와 직접 연결됩니다" },
    benefits: [
      { title: "진짜 동네 고객", body: "위치 기반으로 실제 우리 동네를 지나는 라이더에게 노출됩니다." },
      { title: "심사형 광고", body: "모든 광고는 운영진 심사를 거쳐 게재되어 이웃의 신뢰를 지킵니다." },
      { title: "지도 + 피드 이중 노출", body: "동네지도 핀과 커뮤니티 피드, 두 채널에서 동시에 만나볼 수 있습니다." },
      { title: "소식으로 단골 관리", body: "새 소식을 올려 할인 · 이벤트를 알리고, 후기로 이웃과의 관계를 이어갑니다." },
    ],
    showcase: {
      heading: "이웃이 보는 그대로,<br />가게 소식이 지도 위에 살아 움직입니다",
      body: "동네지도를 여는 이웃에게 가게 핀과 최신 소식이 자연스럽게 눈에 들어옵니다.",
      cta: "비즈니스 시작하기",
    },
    ctaBand: { heading: "지금, 동네 라이더에게<br />가게를 알려보세요", cta: "문의하기" },
    footer: {
      tagline: "사이공라이더 비즈니스 — 동네 라이더에게 가게를 알리는 가장 빠른 방법",
      nav: { how: "이용 방법", app: "사이공라이더 앱", privacy: "개인정보처리방침", contact: "문의하기" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
  en: {
    nav: { how: "Features", app: "Saigon Rider App", start: "Get Started" },
    hero: {
      kicker: "Saigon Rider Business",
      heading: "Introduce your shop<br />to neighborhood riders",
      lead: "Saigon Rider's neighborhood map and feed are screens neighbors check every day. Create a business profile and post updates, and real local customers will find your shop.",
      ctaPrimary: "Contact Us",
      ctaSecondary: "See How It Works",
    },
    howHead: { kicker: "How It Works", heading: "Just three steps" },
    how: [
      { step: "01", title: "Create a Business Profile", body: "Register your shop's info and photos, ready to post updates." },
      { step: "02", title: "Team Review", body: "Every ad goes through review before it's shown, so only trustworthy info reaches neighbors." },
      { step: "03", title: "Appear on the Map & Feed", body: "Approved updates naturally appear as map pins and in the community feed." },
    ],
    benefitsHead: { kicker: "What sets Saigon Rider Business apart", heading: "Connect directly with neighborhood riders" },
    benefits: [
      { title: "Real Local Customers", body: "Shown by location to riders actually passing through your neighborhood." },
      { title: "Reviewed Advertising", body: "Every ad is reviewed by our team, keeping neighbors' trust intact." },
      { title: "Map + Feed, Together", body: "Meet customers through both a neighborhood map pin and the community feed at once." },
      { title: "Keep Regulars With Updates", body: "Post discounts and events, and keep the relationship going through reviews." },
    ],
    showcase: {
      heading: "Exactly as neighbors see it —<br />your shop's news, alive on the map",
      body: "When a neighbor opens the neighborhood map, your shop's pin and latest update naturally catch their eye.",
      cta: "Get Started",
    },
    ctaBand: { heading: "Introduce your shop<br />to neighborhood riders today", cta: "Contact Us" },
    footer: {
      tagline: "Saigon Rider Business — the fastest way to introduce your shop to neighborhood riders",
      nav: { how: "How It Works", app: "Saigon Rider App", privacy: "Privacy Policy", contact: "Contact" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
};
