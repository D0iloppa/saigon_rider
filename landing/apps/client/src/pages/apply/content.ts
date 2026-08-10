import type { Locale } from "@/lib/locale";

export type { Locale };
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABEL } from "@/lib/locale";

interface ApplyCopy {
  brand: string;
  loading: string;
  invalid: { title: string; body: string };
  alreadyAccepted: { title: string; body: string };
  form: {
    kicker: string;
    heading: string; // uses {tier}
    priceLabel: string;
    partnerLabel: string;
    contractHeading: string;
    contractText: string; // uses {tier}
    agreeLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    submit: string;
    submitting: string;
  };
  success: {
    title: string;
    body: string;
    bankInfoLabel: string;
  };
  error: string;
}

export const content: Record<Locale, ApplyCopy> = {
  vi: {
    brand: "Saigon Rider Doanh nghiệp",
    loading: "Đang tải thông tin hợp đồng...",
    invalid: {
      title: "Liên kết không hợp lệ",
      body: "Liên kết này không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ đội ngũ Saigon Rider để nhận liên kết mới.",
    },
    alreadyAccepted: {
      title: "Hợp đồng đã được hoàn tất",
      body: "Hợp đồng quảng cáo này đã được đồng ý trước đó. Không cần thực hiện thêm hành động nào.",
    },
    form: {
      kicker: "Đồng ý hợp đồng quảng cáo",
      heading: "Gói {tier}",
      priceLabel: "Phí hàng tháng",
      partnerLabel: "Đối tác",
      contractHeading: "Nội dung hợp đồng",
      contractText:
        "Hợp đồng này liên quan đến việc đăng ký gói quảng cáo {tier} theo hình thức thuê hàng tháng. Việc đồng ý dưới đây đồng nghĩa với việc bạn chấp nhận Điều khoản dịch vụ và Chính sách đăng quảng cáo của Saigon Rider.",
      agreeLabel: "Tôi đồng ý với nội dung trên",
      nameLabel: "Họ tên người ký",
      namePlaceholder: "Nhập họ tên đầy đủ",
      submit: "Xác nhận đồng ý",
      submitting: "Đang xử lý...",
    },
    success: {
      title: "Hợp đồng đã hoàn tất",
      body: "Vui lòng chuyển khoản theo thông tin dưới đây. Quảng cáo sẽ được đăng sau khi xác nhận thanh toán.",
      bankInfoLabel: "Thông tin chuyển khoản",
    },
    error: "Có lỗi xảy ra, vui lòng thử lại sau.",
  },
  ko: {
    brand: "사이공라이더 비즈니스",
    loading: "계약 정보를 불러오는 중입니다...",
    invalid: {
      title: "유효하지 않은 링크입니다",
      body: "이 링크는 유효하지 않거나 만료되었습니다. 사이공라이더 팀에 문의해 새 링크를 받아주세요.",
    },
    alreadyAccepted: {
      title: "이미 계약이 완료됐습니다",
      body: "이 광고 계약은 이미 동의 처리되었습니다. 추가로 하실 일은 없습니다.",
    },
    form: {
      kicker: "광고 계약 동의",
      heading: "{tier} 상품",
      priceLabel: "월 광고비",
      partnerLabel: "파트너사",
      contractHeading: "계약 내용",
      contractText:
        "본 계약은 {tier} 광고 상품 월 구독에 관한 것으로, 아래 동의는 사이공라이더 서비스 이용약관 및 광고 게재 정책에 동의함을 의미합니다.",
      agreeLabel: "위 내용에 동의합니다",
      nameLabel: "서명자 이름",
      namePlaceholder: "이름을 입력해주세요",
      submit: "동의하고 제출",
      submitting: "처리 중...",
    },
    success: {
      title: "계약이 완료됐습니다",
      body: "안내된 계좌로 입금해주시면 확인 후 광고가 게시됩니다.",
      bankInfoLabel: "계좌 안내",
    },
    error: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  },
  en: {
    brand: "Saigon Rider Business",
    loading: "Loading contract details...",
    invalid: {
      title: "Invalid Link",
      body: "This link is invalid or has expired. Please contact the Saigon Rider team for a new link.",
    },
    alreadyAccepted: {
      title: "Contract Already Completed",
      body: "This ad contract has already been accepted. No further action is needed.",
    },
    form: {
      kicker: "Ad Contract Agreement",
      heading: "{tier} Plan",
      priceLabel: "Monthly Fee",
      partnerLabel: "Partner",
      contractHeading: "Contract Terms",
      contractText:
        "This contract concerns a monthly subscription to the {tier} advertising plan. Agreeing below means you accept Saigon Rider's Terms of Service and Ad Posting Policy.",
      agreeLabel: "I agree to the terms above",
      nameLabel: "Signer's Name",
      namePlaceholder: "Enter your full name",
      submit: "Agree & Submit",
      submitting: "Submitting...",
    },
    success: {
      title: "Contract Completed",
      body: "Please transfer payment using the account info below. Your ad will go live once payment is confirmed.",
      bankInfoLabel: "Bank Transfer Info",
    },
    error: "Something went wrong. Please try again later.",
  },
};

export function formatCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}
