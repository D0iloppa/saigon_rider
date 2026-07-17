import type { Locale } from "@/lib/locale";

export type { Locale };
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABEL, resolveLocale, localePath } from "@/lib/locale";

interface ServiceCopy {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta: string;
  iconLabels?: string[];
}

interface CardCopy {
  title: string;
  body: string;
}

interface StatCopy {
  value: string;
  label: string;
}

interface HomeCopy {
  nav: { services: string; safety: string; business: string; start: string };
  hero: { kicker: string; heading: string; lead: string; ctaPrimary: string; ctaSecondary: string };
  servicesHead: { kicker: string; heading: string };
  services: ServiceCopy[];
  momentsHead: { kicker: string; heading: string };
  moments: CardCopy[];
  safetyHead: { kicker: string; heading: string };
  safety: CardCopy[];
  statsHead: { kicker: string; heading: string };
  stats: StatCopy[];
  ctaBand: { heading: string; cta: string };
  bizBanner: { copy: string; cta: string };
  footer: { tagline: string; nav: { services: string; business: string; privacy: string; contact: string }; bottomLine: string };
}

export const content: Record<Locale, HomeCopy> = {
  vi: {
    nav: { services: "Dịch vụ", safety: "An toàn & Tin cậy", business: "Doanh nghiệp", start: "Bắt đầu ngay" },
    hero: {
      kicker: "Ứng dụng đời sống khu phố cho tài xế Sài Gòn",
      heading: "Hai bánh xe,<br />kết nối khu phố",
      lead: "Sài Gòn — thành phố của xe máy. Saigon Rider gói mua bán đồ cũ với hàng xóm, tin tức quán xá khu phố và thông tin thiết yếu cho tài xế vào một ứng dụng duy nhất.",
      ctaPrimary: "Bắt đầu ngay",
      ctaSecondary: "Khám phá dịch vụ",
    },
    servicesHead: { kicker: "Saigon Rider gần bạn", heading: "Từ mua bán, tin tức khu phố<br />đến an toàn của tài xế — 6 dịch vụ chính" },
    services: [
      {
        eyebrow: "Chợ khu phố · Mua bán đồ cũ",
        title: "Giao dịch trực tiếp, tin cậy với hàng xóm gần bạn",
        body: "Gặp các món đồ đăng theo khu phố, đề xuất giá qua chat, hẹn gặp và giao dịch trực tiếp. Từ nón bảo hiểm, phụ tùng xe đến đồ gia dụng — không phí vận chuyển, không giao dịch với người lạ qua bưu điện.",
        bullets: ["Bảng tin theo vị trí, chỉ hiện đồ ở khu phố của bạn", "Đề xuất giá và hẹn gặp ngay trong chat", "Chỉ số tin cậy và lịch sử giao dịch hiển thị trên từng món đồ"],
        cta: "Xem chi tiết Chợ khu phố",
      },
      {
        eyebrow: "Bản đồ khu phố",
        title: "Cả khu phố trên một tấm bản đồ — quán xá, tin tức, đồ cũ",
        body: "Trên bản đồ khu phố Sài Gòn do Saigon Rider tự vẽ, những quán hàng xóm yêu thích, tin tức mới và đồ cũ gần bạn hiện lên sống động. Nhấn vào ghim để xem tin mới nhất, để lại đánh giá, hoặc lưu lại quán bạn hay đến.",
        bullets: ["15 danh mục ngành hàng để chọn quán khu phố", "Tin tức từ chính quán và đánh giá thật từ hàng xóm", "Danh sách đồ cũ · tin tức theo đúng khu (ward) bạn đang xem"],
        cta: "Xem chi tiết Bản đồ khu phố",
      },
      {
        eyebrow: "Cộng đồng · Đời sống khu phố",
        title: "Bảng tin nơi tin tức khu phố luôn chảy",
        body: "Chia sẻ chuyện khu phố hôm nay, bí quyết chỉ tài xế mới biết, hoặc khoảnh khắc bạn muốn kể lại. Bình luận và cổ vũ giúp câu chuyện tiếp tục, và bạn có thể trò chuyện riêng với hàng xóm hợp ý.",
        bullets: [],
        cta: "Xem chi tiết Cộng đồng",
      },
      {
        eyebrow: "Thông tin tài xế",
        title: "Thông tin đời sống bảo vệ ngày của tài xế",
        body: "Ở Sài Gòn mùa mưa, không gì làm khó tài xế hơn đường ngập. Xem báo ngập thời gian thực từ hàng xóm và các đoạn đường thường ngập chỉ trên một màn hình. Cùng với đó là trạm xăng gần bạn và đánh giá tiệm sửa xe đã được hàng xóm xác nhận.",
        bullets: ["Báo ngập thời gian thực + các đoạn đường thường ngập", "Tìm trạm xăng gần bạn (dữ liệu được hàng xóm cùng đóng góp)", "Đánh giá thực tế các tiệm sửa xe"],
        cta: "Xem chi tiết Thông tin tài xế",
        iconLabels: ["Báo ngập", "Trạm xăng", "Đánh giá tiệm sửa xe"],
      },
      {
        eyebrow: "Phần thưởng khi đi xe",
        title: "Đi bao nhiêu, tích bấy nhiêu — đổi thành phần thưởng thiết thực",
        body: "Mỗi chuyến đi hàng ngày sẽ trở thành điểm (RP). Đổi RP đã tích thành các gifticon thiết thực như một ly cà phê hay thẻ nạp data. Đường vẫn phải đi, cùng Saigon Rider thì đó cũng là phần thưởng.",
        bullets: [],
        cta: "Xem chi tiết Phần thưởng",
      },
      {
        eyebrow: "Saigon Rider Doanh nghiệp",
        title: "Biến quán của bạn thành điểm quen của tài xế khu phố",
        body: "Tạo hồ sơ doanh nghiệp và đăng tin, quán của bạn sẽ tự nhiên xuất hiện trên bản đồ khu phố và bảng tin. Mọi quảng cáo đều qua kiểm duyệt trước khi hiển thị, mang lại sự tin tưởng cho hàng xóm và khách hàng khu phố thật cho bạn.",
        bullets: [],
        cta: "Tìm hiểu Saigon Rider Doanh nghiệp",
      },
    ],
    momentsHead: { kicker: "Gặp Saigon Rider,", heading: "một ngày sẽ khác đi" },
    moments: [
      { title: "Trên đường đi làm", body: "Buổi sáng có tin báo mưa, bạn xem bản đồ báo ngập trước rồi đổi lộ trình. Thay vì giày ướt, là một buổi sáng thong thả hơn." },
      { title: "Giờ nghỉ trưa", body: "Quán phở gần công ty bạn tìm thấy trên bản đồ đã có hai mươi đánh giá từ hàng xóm. Lưu lại và rồi trở thành khách quen." },
      { title: "Cuối tuần", body: "Đăng bán chiếc nón không dùng lên Chợ khu phố, tối đó đã có hẹn giao dịch với hàng xóm cùng khu. Tiện thể đổi RP đã tích thành cốc cà phê." },
    ],
    safetyHead: { kicker: "Xây dựng khu phố đáng tin cậy", heading: "Cách Saigon Rider<br />giữ vững sự tin cậy" },
    safety: [
      { title: "Quảng cáo qua kiểm duyệt", body: "Mọi quảng cáo doanh nghiệp đều được đội ngũ vận hành kiểm duyệt trước khi hiển thị." },
      { title: "Hướng dẫn giao dịch an toàn", body: "Hướng dẫn địa điểm gặp mặt và cách thanh toán để cả người mới giao dịch cũng an tâm." },
      { title: "Chỉ số tin cậy & lịch sử giao dịch", body: "Hoạt động và lịch sử giao dịch tích lũy trên từng hồ sơ, giúp nhận ra hàng xóm đáng tin." },
      { title: "Thông tin do hàng xóm cùng tạo nên", body: "Báo ngập, báo trạm xăng, đánh giá tiệm sửa xe — dữ liệu hàng xóm đã xác thực làm đầy dịch vụ." },
    ],
    statsHead: { kicker: "Saigon Rider", heading: "bắt đầu từ Thành phố Hồ Chí Minh" },
    stats: [
      { value: "Toàn TP.HCM", label: "Khu vực phục vụ" },
      { value: "15 loại", label: "Danh mục quán khu phố" },
      { value: "3 ngôn ngữ", label: "Tiếng Việt · 한국어 · English" },
    ],
    ctaBand: { heading: "Gặp Saigon Rider<br />ở khu phố của bạn ngay hôm nay", cta: "Bắt đầu ngay" },
    bizBanner: { copy: "Bạn là chủ quán? Hãy giới thiệu quán của bạn đến tài xế khu phố.", cta: "Saigon Rider Doanh nghiệp" },
    footer: {
      tagline: "Ứng dụng đời sống khu phố cho tài xế Sài Gòn",
      nav: { services: "Dịch vụ", business: "Doanh nghiệp", privacy: "Chính sách bảo mật", contact: "Liên hệ" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
  ko: {
    nav: { services: "서비스", safety: "안전과 신뢰", business: "비즈니스", start: "앱 시작하기" },
    hero: {
      kicker: "호치민 라이더의 동네 생활 앱",
      heading: "두 바퀴로<br />이어지는 동네",
      lead: "오토바이가 일상인 도시, 사이공. 사이공라이더는 이웃과의 중고거래, 우리 동네 가게와 소식, 그리고 라이더에게 꼭 필요한 생활 정보를 하나의 앱에 담았습니다.",
      ctaPrimary: "앱 시작하기",
      ctaSecondary: "서비스 둘러보기",
    },
    servicesHead: { kicker: "당신 근처의 사이공라이더", heading: "거래부터 동네 소식, 라이더의 안전까지<br />여섯 가지 서비스를 소개합니다." },
    services: [
      {
        eyebrow: "동네마켓 · 중고거래",
        title: "가까운 이웃과, 믿을 수 있는 직거래",
        body: "동네 기준으로 등록된 매물을 만나고, 채팅으로 가격을 제안하고, 약속을 잡아 직접 만나 거래하세요. 헬멧부터 오토바이 용품, 생활용품까지 — 배송비도, 낯선 택배 거래도 없습니다.",
        bullets: ["우리 동네 매물만 골라 보는 위치 기반 피드", "채팅 속 가격제안 · 약속잡기로 흥정부터 만남까지 한 번에", "매물마다 신뢰 지표와 거래 이력 표시"],
        cta: "동네마켓 자세히 보기",
      },
      {
        eyebrow: "동네지도",
        title: "우리 동네가 한 장의 지도에 — 가게, 소식, 매물까지",
        body: "사이공라이더가 직접 그린 호치민 동네지도 위에, 이웃이 사랑하는 가게와 새로 올라온 소식, 근처 매물이 살아 움직입니다. 핀을 눌러 최신 소식을 확인하고, 후기를 남기고, 자주 가는 곳은 찜해두세요.",
        bullets: ["업종 15종 카테고리로 골라 보는 동네 가게", "가게가 직접 올리는 소식과 이웃들의 진짜 후기", "지금 보는 동(ward) 기준으로 따라오는 매물 · 소식 리스트"],
        cta: "동네지도 자세히 보기",
      },
      {
        eyebrow: "커뮤니티 · 동네생활",
        title: "이웃의 소식이 흐르는 동네 피드",
        body: "오늘 동네에서 있었던 일, 라이더끼리만 아는 꿀팁, 함께 나누고 싶은 순간을 올려보세요. 댓글과 응원으로 대화가 이어지고, 마음이 맞는 이웃과는 1:1 채팅으로 더 가까워질 수 있습니다.",
        bullets: [],
        cta: "커뮤니티 자세히 보기",
      },
      {
        eyebrow: "라이더 정보",
        title: "라이더의 하루를 지키는 생활 정보",
        body: "우기의 사이공에서 침수 도로만큼 라이더를 곤란하게 하는 건 없죠. 이웃들의 실시간 침수 제보와 상습 침수 구간을 한 화면에서 확인하세요. 가까운 주유소와 이웃들이 검증한 정비소 후기도 함께.",
        bullets: ["실시간 침수 제보 + 상습 침수 구간", "내 주변 주유소 찾기 (이웃 제보로 채워지는 데이터)", "정비소 실사용 후기"],
        cta: "라이더 정보 자세히 보기",
        iconLabels: ["침수 제보", "주유소", "정비소 후기"],
      },
      {
        eyebrow: "라이딩 리워드",
        title: "달린 만큼 쌓이고, 생활로 돌아오는 리워드",
        body: "매일의 라이딩이 포인트(RP)가 됩니다. 쌓인 RP는 커피 한 잔, 데이터 충전권 같은 실속 있는 기프티콘으로 교환하세요. 어차피 달리는 길, 사이공라이더와 함께라면 보상이 됩니다.",
        bullets: [],
        cta: "리워드 자세히 보기",
      },
      {
        eyebrow: "사이공라이더 비즈니스",
        title: "사장님의 가게를 동네 라이더의 단골집으로",
        body: "비즈프로필을 만들고 소식을 올리면, 가게가 동네지도와 피드에 자연스럽게 노출됩니다. 모든 광고는 심사를 거쳐 게재되어 이웃에게는 신뢰를, 사장님에게는 진짜 동네 고객을 연결해 드립니다.",
        bullets: [],
        cta: "비즈니스 파트너 알아보기",
      },
    ],
    momentsHead: { kicker: "사이공라이더를 만나면", heading: "달라지는 하루" },
    moments: [
      { title: "출근길", body: "비 소식이 있는 아침, 침수 제보 지도를 먼저 확인하고 출발 경로를 바꿉니다. 젖은 신발 대신 여유 있는 출근." },
      { title: "점심시간", body: "지도에서 발견한 회사 근처 쌀국수집, 이웃 후기가 벌써 스무 개. 찜해두고 단골이 되어갑니다." },
      { title: "주말", body: "안 쓰는 헬멧을 마켓에 올렸더니 저녁에 같은 동네 이웃과 거래 약속. 나온 김에 쌓인 RP로 커피 쿠폰도 교환." },
    ],
    safetyHead: { kicker: "믿을 수 있는 동네를 만듭니다", heading: "사이공라이더가<br />신뢰를 지키는 방법" },
    safety: [
      { title: "심사형 광고", body: "모든 비즈니스 광고는 운영진 심사를 거쳐 게재됩니다." },
      { title: "안전거래 가이드", body: "처음 거래하는 이웃도 안심할 수 있도록 만남 장소 · 결제 방법 가이드를 제공합니다." },
      { title: "신뢰 지표와 거래 이력", body: "프로필마다 활동과 거래 기록이 쌓여 믿을 수 있는 이웃을 알아볼 수 있습니다." },
      { title: "이웃이 함께 만드는 정보", body: "침수 제보 · 주유소 제보 · 정비소 후기, 검증된 이웃 데이터가 서비스를 채웁니다." },
    ],
    statsHead: { kicker: "사이공라이더는", heading: "호치민에서 시작합니다" },
    stats: [
      { value: "호치민시 전역", label: "서비스 지역" },
      { value: "15종", label: "동네 가게 카테고리" },
      { value: "3개 언어", label: "Tiếng Việt · 한국어 · English" },
    ],
    ctaBand: { heading: "지금, 우리 동네의<br />사이공라이더를 만나보세요", cta: "앱 시작하기" },
    bizBanner: { copy: "사장님이신가요? 동네 라이더에게 가게를 알려보세요.", cta: "사이공라이더 비즈니스" },
    footer: {
      tagline: "호치민 라이더의 동네 생활 앱",
      nav: { services: "서비스", business: "비즈니스", privacy: "개인정보처리방침", contact: "문의하기" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
  en: {
    nav: { services: "Services", safety: "Safety & Trust", business: "Business", start: "Get Started" },
    hero: {
      kicker: "The neighborhood app for Ho Chi Minh City riders",
      heading: "Two wheels,<br />one neighborhood",
      lead: "Saigon runs on motorbikes. Saigon Rider brings secondhand trading with neighbors, local shop news, and the everyday info riders need into a single app.",
      ctaPrimary: "Get Started",
      ctaSecondary: "Explore Services",
    },
    servicesHead: { kicker: "Saigon Rider, near you", heading: "From trading to local news<br />to rider safety — six core services" },
    services: [
      {
        eyebrow: "Local Market · Secondhand",
        title: "Direct, trustworthy deals with neighbors nearby",
        body: "Browse listings from your own neighborhood, negotiate price over chat, and meet up to trade in person. From helmets and bike gear to household items — no shipping fees, no trading with strangers through delivery.",
        bullets: ["A location-based feed showing only your neighborhood's listings", "Negotiate and set up meetups right inside chat", "Trust scores and trade history shown on every listing"],
        cta: "See Local Market",
      },
      {
        eyebrow: "Neighborhood Map",
        title: "Your whole neighborhood on one map — shops, news, and listings",
        body: "On a map of Ho Chi Minh City drawn by Saigon Rider itself, the shops your neighbors love, fresh updates, and nearby listings come alive. Tap a pin to catch the latest news, leave a review, or save your regular spot.",
        bullets: ["15 categories to browse local shops by", "News straight from shops, plus real reviews from neighbors", "Listings and news that follow the ward you're currently viewing"],
        cta: "See Neighborhood Map",
      },
      {
        eyebrow: "Community · Neighborhood Life",
        title: "A feed where neighborhood news keeps flowing",
        body: "Share what happened in the neighborhood today, tips only riders know, or moments worth passing along. Comments and cheers keep the conversation going, and you can get closer to like-minded neighbors over 1:1 chat.",
        bullets: [],
        cta: "See Community",
      },
      {
        eyebrow: "Rider Info",
        title: "Everyday info that protects a rider's day",
        body: "In Saigon's rainy season, nothing troubles riders more than a flooded road. Check real-time flood reports from neighbors and chronically flooded stretches on one screen. Nearby gas stations and neighbor-verified repair shop reviews come along too.",
        bullets: ["Real-time flood reports + chronically flooded stretches", "Find nearby gas stations (built together from neighbor reports)", "Real reviews of repair shops"],
        cta: "See Rider Info",
        iconLabels: ["Flood Reports", "Gas Stations", "Repair Reviews"],
      },
      {
        eyebrow: "Riding Rewards",
        title: "The more you ride, the more it pays you back",
        body: "Every day's ride turns into points (RP). Trade your RP for practical gifticons like a coffee or a data top-up. You're riding anyway — with Saigon Rider, it pays off.",
        bullets: [],
        cta: "See Rewards",
      },
      {
        eyebrow: "Saigon Rider Business",
        title: "Turn your shop into the neighborhood riders' regular spot",
        body: "Create a business profile and post updates, and your shop naturally shows up on the neighborhood map and feed. Every ad goes through review before it's shown — trust for neighbors, real local customers for you.",
        bullets: [],
        cta: "Learn About Saigon Rider Business",
      },
    ],
    momentsHead: { kicker: "Meet Saigon Rider,", heading: "and your day changes" },
    moments: [
      { title: "Morning Commute", body: "Rain's coming, so you check the flood report map first and reroute. Dry shoes instead of wet ones — a calmer start to the day." },
      { title: "Lunch Break", body: "A phở place near the office you found on the map already has twenty neighbor reviews. Save it, and you're a regular before you know it." },
      { title: "Weekend", body: "You listed an unused helmet on the Market, and by evening you've got a meetup with a neighbor nearby. While you're out, trade your RP for a coffee coupon." },
    ],
    safetyHead: { kicker: "Building a neighborhood you can trust", heading: "How Saigon Rider<br />keeps trust intact" },
    safety: [
      { title: "Reviewed Advertising", body: "Every business ad goes through review by our team before it's posted." },
      { title: "Safe Trading Guide", body: "Guidance on meeting spots and payment methods so even first-time traders feel at ease." },
      { title: "Trust Scores & Trade History", body: "Activity and trade records build up on every profile, so you can spot a neighbor you can trust." },
      { title: "Info Neighbors Build Together", body: "Flood reports, gas station tips, repair shop reviews — verified neighbor data fills out the service." },
    ],
    statsHead: { kicker: "Saigon Rider", heading: "starts in Ho Chi Minh City" },
    stats: [
      { value: "Citywide", label: "Service Area" },
      { value: "15 categories", label: "Local shop categories" },
      { value: "3 languages", label: "Tiếng Việt · 한국어 · English" },
    ],
    ctaBand: { heading: "Meet Saigon Rider<br />in your neighborhood, right now", cta: "Get Started" },
    bizBanner: { copy: "Own a shop? Introduce it to neighborhood riders.", cta: "Saigon Rider Business" },
    footer: {
      tagline: "The neighborhood app for Ho Chi Minh City riders",
      nav: { services: "Services", business: "Business", privacy: "Privacy Policy", contact: "Contact" },
      bottomLine: "Tiếng Việt · 한국어 · English · © 2026 Saigon Rider",
    },
  },
};
