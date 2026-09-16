/**
 * 1년치 테스트 민원 데이터 생성 후 API로 교체 입력
 * 사용: node scripts/seed-year.mjs
 * 환경: API_BASE (기본 http://127.0.0.1:8787), ADMIN_USER, ADMIN_PASS
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_BASE ?? "http://127.0.0.1:8787";
const USER = process.env.ADMIN_USER ?? "admin";
const PASS = process.env.ADMIN_PASS ?? "admin";

// tsx 없이 마스터를 쓰려면 동적 import (프로젝트가 .ts)
async function loadSchema() {
  const schemaPath = pathToFileURL(
    join(root, "src/schema/index.ts"),
  ).href;
  // Node + experimental TypeScript strip may not load .ts — use tsx register via spawn instead
  return null;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIso(dt);
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms =
    new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
  return Math.round(ms / 86_400_000);
}

const WANSAN = [
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
const DEOKJIN = [
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
const ALL_DONGS = [...WANSAN, ...DEOKJIN];

const FIELD_DEPTS = {
  ROAD: ["덕진구 건설과", "완산구 건설과", "덕진구 건축과"],
  PARK: ["덕진구 공원녹지과", "완산구 공원녹지과"],
  CLEAN: ["덕진구 청소위생과", "완산구 청소위생과"],
  TRAFFIC: ["덕진구 산업교통과", "완산구 산업교통과"],
  BUILDING: ["덕진구 건축과", "완산구 건축과"],
  ETC: ["덕진구 민원지적과", "완산구 민원지적과", "덕진구 행정지원과"],
};

// department id = name-based from master: sortOrder as string? Looking at master:
// id: String(sortOrder) from DEPT_RAW
const DEPT_IDS = {
  "덕진구 산업교통과": "107",
  "덕진구 청소위생과": "108",
  "덕진구 공원녹지과": "109",
  "덕진구 건축과": "110",
  "덕진구 건설과": "111",
  "덕진구 민원지적과": "103",
  "덕진구 행정지원과": "102",
  "완산구 산업교통과": "87",
  "완산구 청소위생과": "86",
  "완산구 공원녹지과": "85",
  "완산구 건축과": "84",
  "완산구 건설과": "83",
  "완산구 민원지적과": "75",
};

// Verify wansan dept ids from DEPT_RAW above - I need accurate IDs
// From earlier read:
// [75 might be wrong] - let me read DEPT_RAW for wansan cleaning etc.

const FIELDS = ["ROAD", "PARK", "CLEAN", "TRAFFIC", "BUILDING", "ETC"];
const BASE_ROUTES = [
  "기동처리반 점검사항",
  "공무원 제보",
  "당직(시)",
  "당직(완산구)",
  "당직(덕진구)",
  "기타(언론,전화 등)",
];

const CONTENTS = {
  ROAD: [
    "도로 포트홀 보수 요청",
    "인도 파손 구간 정비 요청",
    "도로 침하로 차량 충격 우려",
    "가로등 주변 도로 균열 보수",
  ],
  PARK: [
    "공원 벤치 파손 교체 요청",
    "하천변 잡초 제거 요청",
    "녹지 무단점유 단속 요청",
    "어린이공원 시설물 점검 요청",
  ],
  CLEAN: [
    "불법투기 쓰레기 수거 요청",
    "종량제봉투 미수거 민원",
    "음식물쓰레기 악취 개선 요청",
    "골목 청소 및 폐기물 처리 요청",
  ],
  TRAFFIC: [
    "장기방치 차량 처리 요청",
    "불법주정차 상습구간 단속 요청",
    "횡단보도 도색 훼손 보수",
    "과속방지턱 설치 검토 요청",
  ],
  BUILDING: [
    "불법 광고물 제거 요청",
    "노후 간판 안전점검 요청",
    "무단 적치물 철거 요청",
    "건축물 외벽 위험 요소 점검",
  ],
  ETC: [
    "기타 생활불편 사항 처리 요청",
    "소음·진동 관련 민원 접수",
    "공공시설 이용불편 개선 요청",
    "현장 확인이 필요한 기타 민원",
  ],
};

const ASSIGNEES = ["김민수", "이서연", "박준호", "최유진", "정하늘", "한도윤"];

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function buildYearComplaints(endIso, days = 365) {
  const rand = mulberry32(20260916);
  const startIso = addDays(endIso, -(days - 1));
  const items = [];
  let seq = 1;

  for (let i = 0; i < days; i++) {
    const receivedAt = addDays(startIso, i);
    const [ry, rm, rd] = receivedAt.split("-").map(Number);
    const dow = new Date(ry, rm - 1, rd).getDay();
    // 주말 적게, 평일 많게 + 계절 가중
    const month = rm;
    const seasonal =
      month === 7 || month === 8 ? 1.4 : month === 12 || month === 1 ? 0.8 : 1;
    const base = dow === 0 || dow === 6 ? 1 : 2;
    const extra = rand() < 0.35 * seasonal ? 1 : 0;
    const count = Math.max(1, Math.min(5, Math.round(base * seasonal) + extra));

    for (let n = 0; n < count; n++) {
      const fieldCode = pick(rand, FIELDS);
      const useCitizen = rand() < 0.62;
      let receiptRouteCode;
      if (useCitizen) {
        const dong = pick(rand, ALL_DONGS);
        receiptRouteCode = `시민불편(${dong})`;
      } else {
        receiptRouteCode = pick(rand, BASE_ROUTES);
      }

      const notifyLag = rand() < 0.7 ? 0 : rand() < 0.85 ? 1 : 2;
      const notifiedAt = addDays(receivedAt, notifyLag);
      // 통보일이 종료일 이후면 클램프
      const notifiedClamped =
        notifiedAt > endIso ? endIso : notifiedAt;

      // 상태 분포: 완료 55%, 예정 25%, 불가 15%, 미정 5%
      const roll = rand();
      let processStatus;
      let completedOrDueAt = null;
      let pendingReason = null;
      if (roll < 0.55) {
        processStatus = "DONE";
        const doneLag = 1 + Math.floor(rand() * 10);
        completedOrDueAt = addDays(notifiedClamped, doneLag);
        if (completedOrDueAt > endIso) completedOrDueAt = endIso;
      } else if (roll < 0.8) {
        processStatus = "SCHEDULED";
        completedOrDueAt = addDays(notifiedClamped, 3 + Math.floor(rand() * 7));
      } else if (roll < 0.95) {
        processStatus = "IMPOSSIBLE";
        pendingReason = pick(rand, [
          "관할 외",
          "사실관계 확인 불가",
          "처리불가",
          "중복 민원",
        ]);
      } else {
        processStatus = null;
      }

      const deptNames = FIELD_DEPTS[fieldCode];
      const deptName = pick(rand, deptNames);
      // fallback id lookup — resolve via name hash later in loader
      const content = pick(rand, CONTENTS[fieldCode]);
      const dongHint =
        receiptRouteCode.match(/\((.+?)\)/)?.[1] ?? pick(rand, ALL_DONGS);

      items.push({
        id: `y${String(seq).padStart(4, "0")}`,
        receiptRouteCode,
        receivedAt,
        notifiedAt: notifiedClamped,
        complainantName: rand() < 0.35 ? "익명" : pick(rand, ["홍길동", "김영희", "이철수", "박민지", "최수현"]),
        complainantPhone:
          rand() < 0.4
            ? null
            : `010-${pad(Math.floor(rand() * 10000))}-${pad(Math.floor(rand() * 10000))}`,
        fieldCode,
        content: `${content} (${dongHint})`,
        location: `${dongHint} 일대 ${Math.floor(rand() * 200) + 1}번지 인근`,
        photoReceiptUrl: null,
        processStatus,
        completedOrDueAt,
        pendingReason,
        departmentName: deptName,
        assigneeName: pick(rand, ASSIGNEES),
        photoBeforeUrl: null,
        photoAfterUrl: null,
        photos: [],
        remark: rand() < 0.15 ? "테스트 연간 데이터" : null,
      });
      seq += 1;
    }
  }

  return { startIso, endIso, items };
}

async function main() {
  // Resolve department IDs from live master via a small eval using tsx
  const { spawnSync } = await import("node:child_process");
  const mapJson = spawnSync(
    "npx",
    [
      "tsx",
      "-e",
      `
import { DEPARTMENT_BY_NAME, DEPARTMENTS } from "./src/schema/master.ts";
const names = ${JSON.stringify(Object.values(FIELD_DEPTS).flat())};
const out = {};
for (const n of names) {
  const d = DEPARTMENT_BY_NAME[n];
  if (!d) throw new Error("missing dept "+n);
  out[n] = d.id;
}
console.log(JSON.stringify(out));
`,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (mapJson.status !== 0) {
    console.error(mapJson.stderr || mapJson.stdout);
    process.exit(1);
  }
  const deptIdByName = JSON.parse(mapJson.stdout.trim().split("\n").pop());

  const endIso = new Date().toISOString().slice(0, 10);
  const { startIso, items: raw } = buildYearComplaints(endIso, 365);
  const complaints = raw.map(({ departmentName, ...rest }) => ({
    ...rest,
    departmentId: deptIdByName[departmentName],
  }));

  console.log(
    `생성: ${startIso} ~ ${endIso} · ${complaints.length}건`,
  );

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!loginRes.ok) {
    console.error("로그인 실패", await loginRes.text());
    process.exit(1);
  }
  const cookie = loginRes.headers.getSetCookie?.()?.[0]?.split(";")[0]
    ?? [...(loginRes.headers).entries()]
      .filter(([k]) => k.toLowerCase() === "set-cookie")
      .map(([, v]) => v.split(";")[0])
      .join("; ");

  // Node fetch: get set-cookie
  let cookieHeader = "";
  const setCookie = loginRes.headers.get("set-cookie");
  if (setCookie) cookieHeader = setCookie.split(",")[0].split(";")[0];
  // Undici may expose getSetCookie
  if (typeof loginRes.headers.getSetCookie === "function") {
    const arr = loginRes.headers.getSetCookie();
    if (arr?.length) cookieHeader = arr.map((c) => c.split(";")[0]).join("; ");
  }

  console.log("로그인 OK, 교체 업로드 중…");
  const replaceRes = await fetch(`${API}/api/complaints/replace`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ complaints }),
  });
  const replaceBody = await replaceRes.json();
  if (!replaceRes.ok) {
    console.error("교체 실패", replaceBody);
    process.exit(1);
  }
  console.log(`민원 교체 완료: ${replaceBody.count}건`);

  // 월말 스냅샷 12개 + 최근 14일 일별 스냅샷 (증감율 테스트용)
  const freezeDates = new Set();
  for (let m = 0; m < 12; m++) {
    const probe = addDays(endIso, -Math.floor((m * 365) / 12));
    // 그 달의 말일에 가깝게: 다음 달 1일의 전날 근사로 probe 사용
    freezeDates.add(probe);
  }
  for (let d = 0; d < 14; d++) freezeDates.add(addDays(endIso, -d));

  let frozen = 0;
  for (const reportDate of [...freezeDates].sort()) {
    const fr = await fetch(`${API}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        reportDate,
        periodFrom: startIso,
        periodTo: endIso,
        note: "연간 테스트 시드 스냅샷",
      }),
    });
    if (fr.ok) frozen += 1;
    else console.warn("스냅샷 실패", reportDate, await fr.text());
  }
  console.log(`스냅샷 확정: ${frozen}건`);
  console.log("완료. 브라우저에서 기간을 연간으로 맞추고 새로고침하세요.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
