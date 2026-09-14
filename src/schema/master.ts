import type {
  Bureau,
  Department,
  DistrictCode,
  Dong,
  FieldCode,
  FieldOption,
  ProcessStatus,
  ProcessStatusOption,
  RouteDetailGroup,
  RouteGroup,
} from "./types";

export const FIELD_OPTIONS: FieldOption[] = [
  { code: "ROAD", label: "도로,도시정비" },
  { code: "PARK", label: "공원,녹지,하천" },
  { code: "CLEAN", label: "청소,환경" },
  { code: "TRAFFIC", label: "교통,가로정비" },
  { code: "BUILDING", label: "건축,광고물" },
  { code: "ETC", label: "기타" },
];

export const FIELD_LABEL: Record<FieldCode, string> = Object.fromEntries(
  FIELD_OPTIONS.map((f) => [f.code, f.label]),
) as Record<FieldCode, string>;

export const PROCESS_STATUS_OPTIONS: ProcessStatusOption[] = [
  { code: "DONE", label: "처리완료" },
  { code: "SCHEDULED", label: "처리예정" },
  { code: "IMPOSSIBLE", label: "처리불가" },
];

export const PROCESS_STATUS_LABEL: Record<ProcessStatus, string> =
  Object.fromEntries(
    PROCESS_STATUS_OPTIONS.map((s) => [s.code, s.label]),
  ) as Record<ProcessStatus, string>;

export const ROUTE_GROUP_LABEL: Record<RouteGroup, string> = {
  MOBILE: "기동처리반",
  DUTY: "당직",
  CITIZEN: "시민불편",
  OFFICIAL: "공무원제보",
  ETC: "기타",
};

export const DAILY_ROUTE_GROUPS: RouteGroup[] = [
  "MOBILE",
  "DUTY",
  "CITIZEN",
  "OFFICIAL",
];

export const ROUTE_DETAIL_LABEL: Record<RouteDetailGroup, string> = {
  MOBILE: "기동처리반",
  DUTY_CITY: "당직(시)",
  DUTY_DISTRICT: "당직(구)",
  CITIZEN: "시민불편(동)",
  OFFICIAL: "공무원 제보",
  ETC: "기타(언론,전화 등)",
};

export const PERIOD_BUCKET_LABEL: Record<string, string> = {
  D1_3: "3일 이내",
  D4_5: "5일 이내",
  D6_7: "7일 이내",
  D8_10: "10일 이내",
  D_OVER_10: "10일 초과",
  SCHEDULED: "처리예정",
  IMPOSSIBLE: "처리불가",
};

export const BUREAUS: Bureau[] = [
  { id: "direct", name: "직속", sortOrder: 1 },
  { id: "planning", name: "기획조정실", sortOrder: 2 },
  { id: "metro", name: "광역도시기반조성국", sortOrder: 3 },
  { id: "economy", name: "경제산업국", sortOrder: 4 },
  { id: "youth", name: "인구청년정책국", sortOrder: 5 },
  { id: "welfare", name: "복지환경국", sortOrder: 6 },
  { id: "culture", name: "문화체육관광국", sortOrder: 7 },
  { id: "construction", name: "건설안전국", sortOrder: 8 },
  { id: "recycle", name: "자연순환녹지국", sortOrder: 9 },
  { id: "transit", name: "대중교통국", sortOrder: 10 },
  { id: "health", name: "보건소", sortOrder: 11 },
  { id: "agri", name: "농업기술센터", sortOrder: 12 },
  { id: "water", name: "상하수도본부", sortOrder: 13 },
  { id: "library", name: "도서관평생학습본부", sortOrder: 14 },
  { id: "office", name: "사업소", sortOrder: 15 },
  { id: "wansan", name: "완산구", sortOrder: 16 },
  { id: "deokjin", name: "덕진구", sortOrder: 17 },
];

const DEPT_RAW: [number, string, string][] = [
  [1, "(부시장 직속) 감사담당관", "direct"],
  [2, "(부시장 직속) 공보담당관", "direct"],
  [3, "(부시장 직속) 홍보담당관", "direct"],
  [4, "(부시장 직속) 국제협력담당관", "direct"],
  [5, "기획조정실 기획예산과", "planning"],
  [6, "기획조정실 총무과", "planning"],
  [7, "기획조정실 자치행정과", "planning"],
  [8, "기획조정실 인권법무과", "planning"],
  [9, "기획조정실 회계과", "planning"],
  [10, "기획조정실 세정과", "planning"],
  [11, "기획조정실 정보화정책과", "planning"],
  [12, "광역도시기반조성국 광역도시조성과", "metro"],
  [13, "광역도시기반조성국 재개발재건축과", "metro"],
  [14, "광역도시기반조성국 도시개발과", "metro"],
  [15, "광역도시기반조성국 공영개발과", "metro"],
  [16, "광역도시기반조성국 도시정비과", "metro"],
  [17, "경제산업국 주력산업과", "economy"],
  [18, "경제산업국 신성장산업과", "economy"],
  [19, "경제산업국 기업지원과", "economy"],
  [20, "경제산업국 일자리정책과", "economy"],
  [21, "경제산업국 민생사회적경제과", "economy"],
  [22, "인구청년정책국 청년정책과", "youth"],
  [23, "인구청년정책국 청년일자리과", "youth"],
  [24, "인구청년정책국 청년활력과", "youth"],
  [25, "인구청년정책국 인구정책과", "youth"],
  [26, "복지환경국 생활복지과", "welfare"],
  [27, "복지환경국 노인복지과", "welfare"],
  [28, "복지환경국 장애인복지과", "welfare"],
  [29, "복지환경국 여성아동과", "welfare"],
  [30, "복지환경국 기후변화대응과", "welfare"],
  [31, "복지환경국 환경위생과", "welfare"],
  [32, "문화체육관광국 문화정책과", "culture"],
  [33, "문화체육관광국 문화산업과", "culture"],
  [34, "문화체육관광국 관광산업과", "culture"],
  [35, "문화체육관광국 국가유산관리과", "culture"],
  [36, "문화체육관광국 체육산업과", "culture"],
  [37, "건설안전국 도시계획과", "construction"],
  [38, "건설안전국 재난안전과", "construction"],
  [39, "건설안전국 건축과", "construction"],
  [40, "건설안전국 도로과", "construction"],
  [41, "건설안전국 하천관리과", "construction"],
  [42, "자연순환녹지국 자원순환과", "recycle"],
  [43, "자연순환녹지국 청소지원과", "recycle"],
  [44, "자연순환녹지국 녹지정원과", "recycle"],
  [45, "자연순환녹지국 산림공원과", "recycle"],
  [46, "대중교통국 교통정책과", "transit"],
  [47, "대중교통국 버스정책과", "transit"],
  [48, "대중교통국 교통안전과", "transit"],
  [49, "대중교통국 차량등록과", "transit"],
  [50, "보건소 보건행정과", "health"],
  [51, "보건소 건강증진과", "health"],
  [52, "보건소 감염병관리과", "health"],
  [53, "보건소 치매마음건강과", "health"],
  [54, "보건소 평화건강생활지원센터", "health"],
  [55, "보건소 덕진보건소", "health"],
  [56, "농업기술센터 농식품산업과", "agri"],
  [57, "농업기술센터 농업정책과", "agri"],
  [58, "농업기술센터 농업기술과", "agri"],
  [59, "농업기술센터 동물정책과", "agri"],
  [60, "상하수도본부 수도행정과", "water"],
  [61, "상하수도본부 급수과", "water"],
  [62, "상하수도본부 수질관리과", "water"],
  [63, "상하수도본부 하수과", "water"],
  [64, "도서관평생학습본부 도서관정책과", "library"],
  [65, "도서관평생학습본부 도서관운영과", "library"],
  [66, "도서관평생학습본부 도서관산업과", "library"],
  [67, "도서관평생학습본부 평생학습과", "library"],
  [68, "(사업소) 동 물 원", "office"],
  [69, "(사업소) 전주풍남학사사무소", "office"],
  [70, "(사업소) 예술단운영사업소", "office"],
  [71, "(사업소) 서울세종사업소", "office"],
  [72, "(사업소) 한옥마을사업소", "office"],
  [73, "완산구 행정지원과", "wansan"],
  [74, "완산구 민원지적과", "wansan"],
  [75, "완산구 생활복지과", "wansan"],
  [76, "완산구 여성가족과", "wansan"],
  [77, "완산구 세무과", "wansan"],
  [78, "완산구 산업교통과", "wansan"],
  [79, "완산구 청소위생과", "wansan"],
  [80, "완산구 공원녹지과", "wansan"],
  [81, "완산구 건축과", "wansan"],
  [82, "완산구 건설과", "wansan"],
  [83, "완산구 중앙동", "wansan"],
  [84, "완산구 풍남동", "wansan"],
  [85, "완산구 노송동", "wansan"],
  [86, "완산구 완산동", "wansan"],
  [87, "완산구 동서학동", "wansan"],
  [88, "완산구 서서학동", "wansan"],
  [89, "완산구 중화산1동", "wansan"],
  [90, "완산구 중화산2동", "wansan"],
  [91, "완산구 평화1동", "wansan"],
  [92, "완산구 평화2동", "wansan"],
  [93, "완산구 서신동", "wansan"],
  [94, "완산구 삼천1동", "wansan"],
  [95, "완산구 삼천2동", "wansan"],
  [96, "완산구 삼천3동", "wansan"],
  [97, "완산구 효자1동", "wansan"],
  [98, "완산구 효자2동", "wansan"],
  [99, "완산구 효자3동", "wansan"],
  [100, "완산구 효자4동", "wansan"],
  [101, "완산구 효자5동", "wansan"],
  [102, "덕진구 행정지원과", "deokjin"],
  [103, "덕진구 민원지적과", "deokjin"],
  [104, "덕진구 생활복지과", "deokjin"],
  [105, "덕진구 여성가족과", "deokjin"],
  [106, "덕진구 세무과", "deokjin"],
  [107, "덕진구 산업교통과", "deokjin"],
  [108, "덕진구 청소위생과", "deokjin"],
  [109, "덕진구 공원녹지과", "deokjin"],
  [110, "덕진구 건축과", "deokjin"],
  [111, "덕진구 건설과", "deokjin"],
  [112, "덕진구 진북동", "deokjin"],
  [113, "덕진구 인후1동", "deokjin"],
  [114, "덕진구 인후2동", "deokjin"],
  [115, "덕진구 인후3동", "deokjin"],
  [116, "덕진구 덕진동", "deokjin"],
  [117, "덕진구 금암동", "deokjin"],
  [118, "덕진구 팔복동", "deokjin"],
  [119, "덕진구 우아1동", "deokjin"],
  [120, "덕진구 우아2동", "deokjin"],
  [121, "덕진구 호성동", "deokjin"],
  [122, "덕진구 송천1동", "deokjin"],
  [123, "덕진구 송천2동", "deokjin"],
  [124, "덕진구 송천3동", "deokjin"],
  [125, "덕진구 조촌동", "deokjin"],
  [126, "덕진구 여의동", "deokjin"],
  [127, "덕진구 혁신동", "deokjin"],
];

export const DEPARTMENTS: Department[] = DEPT_RAW.map(([sortOrder, name, bureauId]) => ({
  id: `dept-${sortOrder}`,
  name,
  bureauId,
  sortOrder,
}));

export const DEPARTMENT_BY_ID = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d]),
) as Record<string, Department>;

export const DEPARTMENT_BY_NAME = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.name, d]),
) as Record<string, Department>;

const WANSAN_DONGS = [
  "중앙동",
  "풍남동",
  "노송동",
  "완산동",
  "동서학동",
  "서서학동",
  "중화산1동",
  "중화산2동",
  "평화1동",
  "평화2동",
  "서신동",
  "삼천1동",
  "삼천2동",
  "삼천3동",
  "효자1동",
  "효자2동",
  "효자3동",
  "효자4동",
  "효자5동",
];

const DEOKJIN_DONGS = [
  "진북동",
  "인후1동",
  "인후2동",
  "인후3동",
  "덕진동",
  "금암동",
  "팔복동",
  "우아1동",
  "우아2동",
  "호성동",
  "송천1동",
  "송천2동",
  "송천3동",
  "조촌동",
  "여의동",
  "혁신동",
];

function makeDongs(district: DistrictCode, names: string[]): Dong[] {
  return names.map((code) => ({
    code,
    district,
    citizenRouteLabel: `시민불편(${code})`,
  }));
}

export const DONGS: Dong[] = [
  ...makeDongs("WANSAN", WANSAN_DONGS),
  ...makeDongs("DEOKJIN", DEOKJIN_DONGS),
];

export const DONG_BY_CODE = Object.fromEntries(
  DONGS.map((d) => [d.code, d]),
) as Record<string, Dong>;

export const BASE_ROUTES = [
  "기동처리반 점검사항",
  "공무원 제보",
  "당직(시)",
  "당직(완산구)",
  "당직(덕진구)",
  "기타(언론,전화 등)",
] as const;

export const RECEIPT_ROUTES: string[] = [
  ...BASE_ROUTES,
  ...DONGS.map((d) => d.citizenRouteLabel),
];

export function inferRouteGroup(routeCode: string): RouteGroup {
  if (routeCode.includes("기동")) return "MOBILE";
  if (routeCode.includes("당직")) return "DUTY";
  if (routeCode.includes("불편")) return "CITIZEN";
  if (routeCode.includes("공무원")) return "OFFICIAL";
  return "ETC";
}

export function inferRouteDetailGroup(routeCode: string): RouteDetailGroup {
  if (routeCode.includes("기동")) return "MOBILE";
  if (routeCode === "당직(시)") return "DUTY_CITY";
  if (routeCode.includes("당직")) return "DUTY_DISTRICT";
  if (routeCode.includes("불편")) return "CITIZEN";
  if (routeCode.includes("공무원")) return "OFFICIAL";
  return "ETC";
}

export function inferDongCode(routeCode: string): string | null {
  const m = routeCode.match(/시민불편(?:사항)?\((.+?)\)/);
  return m?.[1] ?? null;
}

export function fieldCodeFromLabel(label: string): FieldCode {
  const found = FIELD_OPTIONS.find((f) => label.includes(f.label.split(",")[0]!));
  if (found) return found.code;
  if (label.includes("도로")) return "ROAD";
  if (label.includes("공원")) return "PARK";
  if (label.includes("청소")) return "CLEAN";
  if (label.includes("교통")) return "TRAFFIC";
  if (label.includes("건축")) return "BUILDING";
  return "ETC";
}
