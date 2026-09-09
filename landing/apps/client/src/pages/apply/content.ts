import type { Locale } from "@/lib/locale";

export type { Locale };
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABEL } from "@/lib/locale";

interface ApplyCopy {
  brand: string;
  loading: string;
  invalid: { title: string; body: string };
  closed: { title: string; body: string };
  form: {
    kicker: string;
    heading: string; // uses {tier}
    partnerLabel: string;
    contractHeading: string;
    periodHeading: string;
    periodUnavailable: string;
    agreeLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    submit: string;
    submitting: string;
    contractChanged: string;
  };
  status: {
    heading: string; // uses {tier}
    partnerLabel: string;
    amountLabel: string;
    periodLabel: string; // uses {start} {end}
    labels: Record<
      "accepted" | "awaiting_payment" | "partially_paid" | "paid" | "active" | "cancelled" | "refunded",
      string
    >;
  };
  rails: {
    bankHeading: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    bankCode: string;
    bankDue: string; // uses {date}
    bankPreparing: string;
    cardHeading: string;
    cardButton: string;
    cardOpening: string;
    krwNotice: string; // uses {krw}
    bothUnavailable: string;
  };
  payReturn: {
    processing: string;
    success: string;
    error: string;
    retry: string;
    backToContract: string;
  };
  payFail: {
    title: string;
    body: string; // uses {code}
    retry: string;
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
    closed: {
      title: "Hợp đồng đã kết thúc",
      body: "Hợp đồng này đã bị hủy hoặc đã hoàn tiền. Vui lòng liên hệ đội ngũ Saigon Rider nếu cần hỗ trợ.",
    },
    form: {
      kicker: "Đồng ý hợp đồng quảng cáo",
      heading: "Gói {tier}",
      partnerLabel: "Đối tác",
      contractHeading: "Nội dung hợp đồng",
      periodHeading: "Chọn kỳ hạn",
      periodUnavailable: "Chưa có giá",
      agreeLabel: "Tôi đồng ý với nội dung trên",
      nameLabel: "Họ tên người ký",
      namePlaceholder: "Nhập họ tên đầy đủ",
      submit: "Xác nhận đồng ý",
      submitting: "Đang xử lý...",
      contractChanged: "Nội dung hợp đồng đã được cập nhật. Vui lòng đọc lại và xác nhận.",
    },
    status: {
      heading: "Gói {tier}",
      partnerLabel: "Đối tác",
      amountLabel: "Số tiền hợp đồng",
      periodLabel: "Thời hạn quảng cáo: {start} – {end}",
      labels: {
        accepted: "Đã đồng ý — đang chuẩn bị hướng dẫn thanh toán",
        awaiting_payment: "Chờ thanh toán",
        partially_paid: "Đã nhận một phần khoản thanh toán",
        paid: "Đã thanh toán đủ — đang chờ duyệt",
        active: "Đang hoạt động",
        cancelled: "Đã hủy",
        refunded: "Đã hoàn tiền",
      },
    },
    rails: {
      bankHeading: "Chuyển khoản ngân hàng",
      bankName: "Ngân hàng",
      bankAccount: "Số tài khoản",
      bankHolder: "Chủ tài khoản",
      bankCode: "Mã thanh toán (ghi vào nội dung chuyển khoản)",
      bankDue: "Hạn thanh toán: {date}",
      bankPreparing: "Chuyển khoản ngân hàng đang được chuẩn bị.",
      cardHeading: "Thanh toán bằng thẻ",
      cardButton: "Thanh toán bằng thẻ",
      cardOpening: "Đang mở cổng thanh toán...",
      krwNotice: "Bạn sẽ bị tính phí {krw} và ngân hàng phát hành thẻ sẽ quy đổi sang VND theo tỷ giá của họ.",
      bothUnavailable: "Thông tin thanh toán đang được chuẩn bị. Đội ngũ Saigon Rider sẽ liên hệ với bạn.",
    },
    payReturn: {
      processing: "Đang xác nhận thanh toán...",
      success: "Thanh toán thành công. Quảng cáo của bạn sẽ sớm được kích hoạt.",
      error: "Không thể xác nhận thanh toán. Vui lòng liên hệ đội ngũ Saigon Rider.",
      retry: "Thử xác nhận lại",
      backToContract: "Quay lại trang hợp đồng",
    },
    payFail: {
      title: "Thanh toán không thành công",
      body: "Thanh toán đã bị hủy hoặc thất bại (mã lỗi: {code}). Bạn có thể thử lại hoặc chọn chuyển khoản ngân hàng.",
      retry: "Quay lại trang hợp đồng",
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
    closed: {
      title: "종료된 계약입니다",
      body: "이 계약은 취소되었거나 환불 처리되었습니다. 도움이 필요하면 사이공라이더 팀에 문의해주세요.",
    },
    form: {
      kicker: "광고 계약 동의",
      heading: "{tier} 상품",
      partnerLabel: "파트너사",
      contractHeading: "계약 내용",
      periodHeading: "기간 선택",
      periodUnavailable: "가격 미정",
      agreeLabel: "위 내용에 동의합니다",
      nameLabel: "서명자 이름",
      namePlaceholder: "이름을 입력해주세요",
      submit: "동의하고 제출",
      submitting: "처리 중...",
      contractChanged: "계약 내용이 갱신되었습니다. 다시 확인하고 동의해주세요.",
    },
    status: {
      heading: "{tier} 상품",
      partnerLabel: "파트너사",
      amountLabel: "계약 금액",
      periodLabel: "광고 게재 기간: {start} ~ {end}",
      labels: {
        accepted: "동의 완료 — 결제 안내 준비 중",
        awaiting_payment: "결제 대기 중",
        partially_paid: "일부 금액 입금됨",
        paid: "결제 완료 — 승인 대기 중",
        active: "게재 중",
        cancelled: "취소됨",
        refunded: "환불됨",
      },
    },
    rails: {
      bankHeading: "계좌이체",
      bankName: "은행명",
      bankAccount: "계좌번호",
      bankHolder: "예금주",
      bankCode: "입금 식별코드 (입금 시 적요에 기재)",
      bankDue: "입금 기한: {date}",
      bankPreparing: "계좌이체 안내를 준비 중입니다.",
      cardHeading: "카드로 결제",
      cardButton: "카드로 결제",
      cardOpening: "결제창을 여는 중...",
      krwNotice: "₩{krw} 이 청구되며, 카드사가 자체 환율로 VND 로 환산해 청구합니다.",
      bothUnavailable: "결제 안내를 준비 중입니다. 담당자가 곧 연락드리겠습니다.",
    },
    payReturn: {
      processing: "결제를 확인하는 중입니다...",
      success: "결제가 완료되었습니다. 곧 광고가 게재됩니다.",
      error: "결제 확인에 실패했습니다. 사이공라이더 팀에 문의해주세요.",
      retry: "결제 확인 다시 시도",
      backToContract: "계약 페이지로 돌아가기",
    },
    payFail: {
      title: "결제에 실패했습니다",
      body: "결제가 취소되었거나 실패했습니다 (오류 코드: {code}). 다시 시도하거나 계좌이체를 이용해주세요.",
      retry: "계약 페이지로 돌아가기",
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
    closed: {
      title: "Contract Closed",
      body: "This contract has been cancelled or refunded. Please contact the Saigon Rider team if you need help.",
    },
    form: {
      kicker: "Ad Contract Agreement",
      heading: "{tier} Plan",
      partnerLabel: "Partner",
      contractHeading: "Contract Terms",
      periodHeading: "Choose a period",
      periodUnavailable: "Price not set",
      agreeLabel: "I agree to the terms above",
      nameLabel: "Signer's Name",
      namePlaceholder: "Enter your full name",
      submit: "Agree & Submit",
      submitting: "Submitting...",
      contractChanged: "The contract terms were updated. Please review and agree again.",
    },
    status: {
      heading: "{tier} Plan",
      partnerLabel: "Partner",
      amountLabel: "Contract Amount",
      periodLabel: "Ad period: {start} – {end}",
      labels: {
        accepted: "Agreed — preparing payment instructions",
        awaiting_payment: "Awaiting payment",
        partially_paid: "Partial payment received",
        paid: "Paid in full — awaiting approval",
        active: "Live",
        cancelled: "Cancelled",
        refunded: "Refunded",
      },
    },
    rails: {
      bankHeading: "Bank Transfer",
      bankName: "Bank",
      bankAccount: "Account Number",
      bankHolder: "Account Holder",
      bankCode: "Payment Code (include in the transfer memo)",
      bankDue: "Due by: {date}",
      bankPreparing: "Bank transfer instructions are being prepared.",
      cardHeading: "Pay by Card",
      cardButton: "Pay by Card",
      cardOpening: "Opening payment window...",
      krwNotice: "You will be charged ₩{krw}, converted to VND by your card issuer at their exchange rate.",
      bothUnavailable: "Payment options are being prepared. Our team will contact you shortly.",
    },
    payReturn: {
      processing: "Confirming your payment...",
      success: "Payment complete. Your ad will go live shortly.",
      error: "Could not confirm the payment. Please contact the Saigon Rider team.",
      retry: "Retry confirmation",
      backToContract: "Back to contract page",
    },
    payFail: {
      title: "Payment Failed",
      body: "The payment was cancelled or failed (error code: {code}). You can try again or use bank transfer.",
      retry: "Back to contract page",
    },
    error: "Something went wrong. Please try again later.",
  },
};

export function formatCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}
