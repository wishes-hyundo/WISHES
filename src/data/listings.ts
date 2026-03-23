export interface Listing {
  id: string;
  title: string;
  type: '원룸' | '투룸' | '쓰리룸' | '오피스텔' | '아파트' | '상가' | '사무실';
  deal: '전세' | '월세' | '매매';
  deposit: number;       // 보증금 (만원)
  monthly?: number;      // 월세 (만원, 월세일 때만)
  price?: number;        // 매매가 (만원, 매매일 때만)
  area: number;          // 전용면적 (㎡)
  floor: string;         // 층수
  address: string;       // 주소
  dong: string;          // 동 (신림동, 봉천동 등)
  features: string[];    // 옵션 (에어컨, 세탁기 등)
  description: string;   // 상세 설명
  images: string[];      // 이미지 URL
  available: boolean;    // 입주 가능 여부
  availableDate?: string;// 입주 가능일
  built?: string;        // 준공년도
  parking?: boolean;     // 주차 가능
  elevator?: boolean;    // 엘리베이터
  pet?: boolean;         // 반려동물
  status: '가용' | '계약중' | '계약완료';
  createdAt: string;
  updatedAt: string;
}

// 샘플 매물 데이터 (실제 데이터로 교체 예정)
export const listings: Listing[] = [
  {
    id: "1",
    title: "신림역 5분 풀옵션 원룸",
    type: "원룸",
    deal: "월세",
    deposit: 1000,
    monthly: 50,
    area: 19.8,
    floor: "3/5층",
    address: "서울 관악구 신림로 340",
    dong: "신림동",
    features: ["에어컨", "세탁기", "냉장고", "전자레인지", "인덕션"],
    description: "신림역 도보 5분 거리의 깨끷한 풀옵션 원룸입니다. 남향으로 채광이 좋고, 보안이 철저합니다. 편의점, 마트가 도보 1분 거리에 있습니다.",
    images: ["/images/sample-1.jpg"],
    available: true,
    availableDate: "즉시입주",
    built: "2019",
    parking: false,
    elevator: true,
    pet: false,
    status: "가용",
    createdAt: "2026-03-20",
    updatedAt: "2026-03-20"
  },
  {
    id: "2",
    title: "서울대입구역 인근 넓은 투룸",
    type: "투룸",
    deal: "전세",
    deposit: 18000,
    area: 39.6,
    floor: "4/6층",
    address: "서울 관악구 봉천로 218",
    dong: "봉천동",
    features: ["에어컨", "세탁기", "냉장고", "가스레인지", "신발장"],
    description: "서울대입구역 도보 8분, 넓은 투룸 전세입니다. 분리형 구조로 거실과 방이 독립적이며, 수납공간이 넉넉합니다.",
    images: ["/images/sample-2.jpg"],
    available: true,
    availableDate: "2026-04-15",
    built: "2015",
    parking: true,
    elevator: true,
    pet: false,
    status: "가용",
    createdAt: "2026-03-18",
    updatedAt: "2026-03-22"
  },
  {
    id: "3",
    title: "관악구청 앞 신축 오피스텔",
    type: "오피스텔",
    deal: "월세",
    deposit: 2000,
    monthly: 70,
    area: 26.4,
    floor: "8/15층",
    address: "서울 관악구 관악로 145",
    dong: "봉천동",
    features: ["에어컨", "세탁기", "냉장고", "인덕션", "빌트인툴장", "CCTV"],
    description: "2025년 준공 신축 오피스텔입니다. 풀툵션에 보안 시스템이 완비되어 있으며, 관악구청, 은행, 병원이 도보 3분 이내입니다.",
    images: ["/images/sample-3.jpg"],
    available: true,
    availableDate: "즉시입주",
    built: "2025",
    parking: true,
    elevator: true,
    pet: true,
    status: "가용",
    createdAt: "2026-03-15",
    updatedAt: "2026-03-23"
  },
  {
    id: "4",
    title: "신림동 역세권 매매 아파트",
    type: "아파트",
    deal: "매매",
    deposit: 0,
    price: 42000,
    area: 59.9,
    floor: "12/20층",
    address: "서울 관악구 신림로 59길 15",
    dong: "신림동",
    features: ["에어컨", "세탁기", "냉장고", "시스템에어컨", "붙박이장"],
    description: "신림역 도보 7분, 관리 잘 된 아파트 매매입니다. 남동향, 3룸 구조로 가족 거주에 적합합니다. 학군 우수(신림초, 관악중 인근).",
    images: ["/images/sample-4.jpg"],
    available: true,
    built: "2010",
    parking: true,
    elevator: true,
    pet: true,
    status: "가용",
    createdAt: "2026-03-10",
    updatedAt: "2026-03-20"
  },
  {
    id: "5",
    title: "봉천동 조용한 주택가 원룸",
    type: "원룸",
    deal: "월세",
    deposit: 500,
    monthly: 40,
    area: 16.5,
    floor: "2/3층",
    address: "서울 관악구 봉천로 47길 8",
    dong: "봉천동",
    features: ["에어컨", "냉장고", "전자레인지"],
    description: "조용한 주택가에 위칙한 아담한 원룸입니다. 서울대입구역 도보 12분, 저렴한 가격이 장점입니다.",
    images: ["/images/sample-5.jpg"],
    available: true,
    availableDate: "즉시입주",
    built: "2012",
    parking: false,
    elevator: false,
    pet: false,
    status: "가용",
    createdAt: "2026-03-22",
    updatedAt: "2026-03-22"
  },
  {
    id: "6",
    title: "신림역 대로변 1층 상가",
    type: "상가",
    deal: "월세",
    deposit: 5000,
    monthly: 200,
    area: 49.5,
    floor: "1/5층",
    address: "서울 관악구 신림로 315",
    dong: "신림동",
    features: ["주차가능", "대로변", "코너"],
    description: "신림역 대로변 1층 코너 상가입니다. 유동인구가 많아 업종 제한 없이 사용 가능합니다. 전면 8m, 가시성 우수.",
    images: ["/images/sample-6.jpg"],
    available: true,
    built: "2008",
    parking: true,
    elevator: false,
    pet: false,
    status: "가용",
    createdAt: "2026-03-19",
    updatedAt: "2026-03-23"
  }
];

export function getListingById(id: string): Listing | undefined {
  return listings.find(l => l.id === id);
}

export function getFilteredListings(filters: {
  type?: string;
  deal?: string;
  dong?: string;
  minDeposit?: number;
  maxDeposit?: number;
  minMonthly?: number;
  maxMonthly?: number;
}): Listing[] {
  return listings.filter(l => {
    if (l.status === '계약완료') return false;
    if (filters.type && l.type !== filters.type) return false;
    if (filters.deal && l.deal !== filters.deal) return false;
    if (filters.dong && l.dong !== filters.dong) return false;
    if (filters.minDeposit && l.deposit < filters.minDeposit) return false;
    if (filters.maxDeposit && l.deposit > filters.maxDeposit) return false;
    if (filters.minMonthly && l.deal === '월세' && (l.monthly || 0) < filters.minMonthly) return false;
    if (filters.maxMonthly && l.deal === '월세' && (l.monthly || 0) > filters.maxMonthly) return false;
    return true;
  });
}

export function formatPrice(listing: Listing): string {
  if (listing.deal === '매매' && listing.price) {
    return listing.price >= 10000
      ? `매매 ${Math.floor(listing.price / 10000)}억${listing.price % 10000 > 0 ? ` ${listing.price % 10000}만` : ''}`
      : `매매 ${listing.price.toLocaleString()}만원`;
  }
  if (listing.deal === '전세') {
    return listing.deposit >= 10000
      ? `전세 ${Math.floor(listing.deposit / 10000)}억${listing.deposit % 10000 > 0 ? ` ${listing.deposit % 10000}만` : ''}`
      : `전세 ${listing.deposit.toLocaleString()}만원`;
  }
  return `월세 ${listing.deposit.toLocaleString()}/${listing.monthly?.toLocaleString()}만원`;
}
