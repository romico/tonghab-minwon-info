export const SITE_URL = "https://minwon.uany.net/";
export const PRODUCT_NAME = "민원 AX · 통합민원정보";
export const OPERATOR = "내부 업무용 포터블 배포";

export type LegalDocId =
  | "notice"
  | "privacy"
  | "terms"
  | "license"
  | "opensource";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "h3"; text: string };

export type LegalDocument = {
  id: LegalDocId;
  title: string;
  updatedAt: string;
  summary: string;
  blocks: LegalBlock[];
};

export const LEGAL_DOCS: Record<LegalDocId, LegalDocument> = {
  notice: {
    id: "notice",
    title: "법적고지",
    updatedAt: "2026-09-17",
    summary: "본 소프트웨어의 성격·책임 범위·이용 제한에 관한 고지입니다.",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME}은 생활민원 관리대장·현황·보고를 로컬(포터블) 환경에서 운영하기 위한 내부 업무용 소프트웨어입니다.`,
      },
      { type: "h3", text: "1. 서비스 성격" },
      {
        type: "ul",
        items: [
          "공식 대민 민원 창구가 아니며, 인터넷에 상시 공개되는 SaaS가 아닙니다.",
          "실행 기기(PC·USB 등)의 로컬 SQLite에 데이터가 저장됩니다.",
          "소개·다운로드 안내는 공식 사이트에서 제공합니다.",
        ],
      },
      { type: "h3", text: "2. 책임의 한계" },
      {
        type: "ul",
        items: [
          "운영 주체·배포 담당자가 정한 내부 절차에 따라 사용해야 합니다.",
          "DB 파일 분실·무단 복사·잘못된 백업으로 인한 데이터 손실에 대해, 소프트웨어 자체는 완전한 보장을 하지 않습니다. 정기 백업(data 폴더 전체)을 권장합니다.",
          "제3자 하드웨어·OS·백신·네트워크 환경으로 인한 장애는 해당 환경의 책임 범위에 따릅니다.",
        ],
      },
      { type: "h3", text: "3. 금지·주의" },
      {
        type: "ul",
        items: [
          "권한 없는 자에게 설치 패키지·DB·보관본(archives)을 제공하지 마세요.",
          "개인정보가 포함된 엑셀·화면을 외부에 공유할 때는 마스킹·내부 규정 준수가 필요합니다.",
          "본 고지는 관련 법령 및 내부 규정에 따라 개정될 수 있습니다.",
        ],
      },
    ],
  },
  privacy: {
    id: "privacy",
    title: "개인정보 처리방침",
    updatedAt: "2026-09-17",
    summary:
      "로컬 저장·암호화·접근 통제 등 본 앱에서 다루는 개인정보 처리 원칙입니다.",
    blocks: [
      {
        type: "p",
        text: "본 방침은 통합민원정보 앱이 처리하는 민원인 성명·연락처·현장사진 등 개인정보에 적용됩니다. 앱은 기본적으로 단일 관리자(또는 내부 허가 사용자)가 로컬에서 운영합니다.",
      },
      { type: "h3", text: "1. 수집·이용 항목" },
      {
        type: "ul",
        items: [
          "민원 업무 처리에 필요한 성명, 연락처, 민원 내용, 위치, 처리 정보, 현장·처리 전·후 사진 등",
          "계정(아이디·비밀번호 해시), 선택적 2단계 인증(TOTP) 설정",
          "감사 로그(로그인·설정·민원 변경 등 요약)",
        ],
      },
      { type: "h3", text: "2. 보관 위치" },
      {
        type: "ul",
        items: [
          "실행 폴더의 data/tonghab-minwon.db (및 WAL 등 부가 파일)",
          "아카이브 시 data/archives/ 하위 보관본",
          "클라우드 서버로 자동 전송하지 않습니다. 업데이트 확인 시에만 버전 피드에 연결할 수 있습니다.",
        ],
      },
      { type: "h3", text: "3. 보호 조치" },
      {
        type: "ul",
        items: [
          "로그인 세션(쿠키)으로 API 접근을 제한합니다.",
          "민원인 성명·연락처·사진은 저장 시 AES-256-GCM으로 암호화되며, 로그인 시 잠금이 해제됩니다.",
          "선택적으로 TOTP 2단계 인증을 사용할 수 있습니다.",
          "엑셀 내보내기 시 개인정보 마스킹 옵션을 제공할 수 있습니다.",
        ],
      },
      { type: "h3", text: "4. 이용자·운영자 유의" },
      {
        type: "ul",
        items: [
          "DB·archives 파일은 개인정보가 포함되므로 USB·공유 폴더 관리에 주의하세요.",
          "비밀번호 변경 시 암호화 키도 함께 회전됩니다. 아카이브 복원 시에는 보관 시점 비밀번호가 필요할 수 있습니다.",
          "민원 본문·위치에 연락처를 기입하지 않는 운영을 권장합니다.",
        ],
      },
      { type: "h3", text: "5. 문의" },
      {
        type: "p",
        text: "개인정보 처리에 관한 문의는 내부 운영 담당자에게 해 주세요. 기술·배포 안내는 공식 소개 사이트를 참고할 수 있습니다.",
      },
    ],
  },
  terms: {
    id: "terms",
    title: "이용약관",
    updatedAt: "2026-09-17",
    summary: "내부 업무용 소프트웨어 이용에 관한 기본 조건입니다.",
    blocks: [
      {
        type: "p",
        text: `본 약관은 ${PRODUCT_NAME}(${OPERATOR})의 설치·사용에 적용됩니다. 로그인하거나 패키지를 실행하면 본 약관에 동의한 것으로 봅니다.`,
      },
      { type: "h3", text: "1. 이용 자격" },
      {
        type: "ul",
        items: [
          "배포·운영 주체가 허가한 내부 사용자만 이용할 수 있습니다.",
          "계정·비밀번호·2FA 수단을 타인과 공유하지 마세요.",
        ],
      },
      { type: "h3", text: "2. 허용되는 이용" },
      {
        type: "ul",
        items: [
          "생활민원 관리대장 입력·조회, HWPX 가져오기, 현황·보고 집계, 엑셀 내보내기",
          "관리연도·기간 마감을 위한 DB 아카이브·복원·보관본 관리",
          "설정에서 제공하는 보안·용량·업데이트 기능",
        ],
      },
      { type: "h3", text: "3. 금지" },
      {
        type: "ul",
        items: [
          "허가 없는 재배포·재판매·리버스 엔지니어링(관계 법령이 허용하는 범위 제외)",
          "개인정보·업무 데이터의 무단 반출",
          "시스템을 방해하거나 보안을 우회하려는 행위",
        ],
      },
      { type: "h3", text: "4. 데이터·백업" },
      {
        type: "ul",
        items: [
          "데이터 소유·관리 책임은 운영 조직에 있습니다.",
          "백업은 data 폴더 전체(archives 포함)를 권장합니다.",
        ],
      },
      { type: "h3", text: "5. 약관 변경" },
      {
        type: "p",
        text: "약관은 앱 버전 업데이트와 함께 개정될 수 있으며, 설정 → 민원 AX 정보에서 확인할 수 있습니다.",
      },
    ],
  },
  license: {
    id: "license",
    title: "라이선스 정책",
    updatedAt: "2026-09-17",
    summary: "본 제품(앱 본체)과 동봉 구성 요소의 이용 허가 범위입니다.",
    blocks: [
      { type: "h3", text: "1. 앱 본체" },
      {
        type: "ul",
        items: [
          `${PRODUCT_NAME} 애플리케이션 코드·브랜드·문서의 저작권은 배포·운영 주체에 귀속됩니다.`,
          "내부 업무 목적의 설치·사용·백업 복제만 허용됩니다.",
          "소스·바이너리의 공개 재배포는 별도 서면 허가 없이 허용되지 않습니다.",
        ],
      },
      { type: "h3", text: "2. 포터블 런타임" },
      {
        type: "ul",
        items: [
          "패키지에 포함된 Node.js 런타임은 Node.js 프로젝트의 라이선스(MIT 등)를 따릅니다.",
          "런타임 자체는 본 앱 라이선스와 별개로 해당 프로젝트 조건을 준수해야 합니다.",
        ],
      },
      { type: "h3", text: "3. 오픈소스 의존성" },
      {
        type: "p",
        text: "앱이 사용하는 오픈소스 라이브러리는 「오픈소스 고지」에 정리되어 있으며, 각 라이선스 조건을 존중합니다.",
      },
      { type: "h3", text: "4. 상표" },
      {
        type: "p",
        text: "「민원 AX」「통합민원정보」 등 명칭의 사용은 소개·운영 목적에 한하며, 오인·혼동을 주는 사용은 할 수 없습니다.",
      },
    ],
  },
  opensource: {
    id: "opensource",
    title: "오픈소스 고지",
    updatedAt: "2026-09-17",
    summary: "본 제품이 사용하는 주요 오픈소스 구성 요소와 라이선스입니다.",
    blocks: [
      {
        type: "p",
        text: "아래는 package.json 기준 직접 의존성입니다. 각 패키지의 정확한 조건은 해당 프로젝트의 LICENSE 파일을 따릅니다.",
      },
      { type: "h3", text: "런타임·UI" },
      {
        type: "ul",
        items: [
          "react, react-dom — MIT (Meta)",
          "react-router-dom — MIT",
        ],
      },
      { type: "h3", text: "서버·유틸" },
      {
        type: "ul",
        items: [
          "express — MIT",
          "exceljs — MIT",
          "file-saver — MIT",
          "jszip — MIT / GPLv3 dual (프로젝트 관행에 따라 MIT 사용)",
          "qrcode — MIT",
        ],
      },
      { type: "h3", text: "빌드·개발" },
      {
        type: "ul",
        items: [
          "vite, @vitejs/plugin-react — MIT",
          "typescript — Apache-2.0",
          "tsx, esbuild, concurrently — MIT / 각 프로젝트 LICENSE",
          "Node.js (포터블 번들) — Node.js LICENSE",
        ],
      },
      {
        type: "p",
        text: "오픈소스 고지 누락·정정 요청은 내부 운영 담당자 또는 배포 채널을 통해 알려 주세요.",
      },
    ],
  },
};

export const LEGAL_NAV: Array<{
  id: LegalDocId;
  label: string;
}> = [
  { id: "notice", label: "법적고지" },
  { id: "privacy", label: "개인정보 처리방침" },
  { id: "terms", label: "이용약관" },
  { id: "license", label: "라이선스 정책" },
  { id: "opensource", label: "오픈소스 고지" },
];

export function isLegalDocId(value: string): value is LegalDocId {
  return value in LEGAL_DOCS;
}
