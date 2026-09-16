#!/usr/bin/env python3
"""테스트자료 1/2/5.hwpx 템플릿 기반 유사 시민불편 수렴 관리카드 3종 x 500건 생성
- 형식1: 테스트자료 1.hwpx (수렴 및 관리카드 A)
- 형식2: 테스트자료 2.hwpx (수렴 및 관리카드 B, 현장사진 5칸)
- 형식5: 테스트자료 5.hwpx (수렴 및 관리카드 C, 민원접수 표기)
- 날짜: 2026.03.01 ~ 2026.08.31 (평일 가중)
- BinData/Preview 이미지는 템플릿 원본 재사용
"""
import zipfile, re, random, json
from datetime import date, timedelta
from pathlib import Path

BASE = Path("/Users/bongkrazkim/workspace/tonghab-minwon-info/docs/sample")
OUT = BASE / "generated"
OUT.mkdir(exist_ok=True)
PREVIEW = BASE / "preview"
PREVIEW.mkdir(exist_ok=True)
SEED = 20260916
PER_FORM = 500
random.seed(SEED)

DONGS = ["중앙동","풍남동","노송동","완산동","동서학동","서서학동","중화산1동","중화산2동",
         "평화1동","평화2동","서신동","삼천1동","삼천2동","삼천3동","효자1동","효자2동",
         "효자3동","효자4동","효자5동","진북동","인후1동","인후2동","인후3동","덕진동",
         "금암1동","금암2동","팔복동","우아1동","우아2동","호성동","송천1동","송천2동",
         "송천3동","조촌동"]

STREETS = ["아중로","덕수대로","무궁화로","호산로","삼천로","서암로","중앙대로","완산로",
           "효자길","인성로","덕진로","금암로","우아로","호성로","송천로","조촌로"]

# (제목, [상황 문장(변수 없음, 공통)], 담당부서)
TYPES = [
 ("맨홀 역류 방지 정비", "폭우 시 맨홀 역류로 도로 침수됨에 따라 역류 방지 정비", "건설과"),
 ("도로 포트홀 보수", "도로 노면에 포트홀이 발생하여 차량 통행 시 안전사고 위험에 따라 도로 보수", "건설과"),
 ("보도블록 들뜸 보수", "보도블록이 들뜸·파손되어 보행자 안전사고 위험에 따라 보도블록 정비", "건설과"),
 ("가로등 고장 수리", "가로등이 소등되어 야간 보행 안전사고 위험에 따라 가로등 수리", "건설과"),
 ("하수구 역류 정비", "하수구 배수 불량으로 우천 시 도로 침수 발생에 따라 하수구 정비", "건설과"),
 ("도로 배수로 정비", "도로변 배수로에 이물질이 적체되어 배수 기능 저하에 따라 배수로 정비", "건설과"),
 ("농수로 용량 확대", "농수로 관로 용량 부족으로 폭우 시 인근 농지 침수(주택 침수 위험)에 따라 관로 용량 확대", "농업정책과"),
 ("하천 수로 준설", "하천 수로에 토사가 퇴적되어 배수 기능 저하 및 수해 위험에 따라 수로 준설", "하천관리과"),
 ("하천 사면 정비", "하천 사면이 침식·붕괴되어 인근 주민 안전사고 위험에 따라 하천 사면 정비", "하천관리과"),
 ("하천 이물질 제거", "하천에 생활폐기물 등이 방류되어 수질 저해 및 하천 미관 저하에 따라 이물질 제거", "하천관리과"),
 ("불법투기 쓰레기 수거", "해당 구간은 불법투기 쓰레기가 수거되지 않아 지속적으로 쓰레기가 투기되는 상황으로 주변 환경이 저해되고 있으므로 불법투기 쓰레기 수거 처리", "청소위생과"),
 ("종량제 봉투 미수거 처리", "종량제 봉투 쓰레기가 수거되지 않아 악취 발생 및 주변 환경이 저해되고 있으므로 미수거 쓰레기 수거 처리", "청소위생과"),
 ("음반(음대) 미수거 처리", "음반(음대)이 적체되어 악취 발생 및 주변 환경이 저해되고 있으므로 음반 수거 처리", "청소위생과"),
 ("대형폐기물 무단투기 수거", "대형폐기물이 무단투기되어 주변 환경이 저해되고 있으므로 대형폐기물 수거 처리", "청소위생과"),
 ("장기방치차량 처리", "학교 통학로 횡단보도 옆 장기방치차량으로 통행불편 및 도시미관 저해에 따라 장기방치된 차량 처리", "산업교통과"),
 ("노상 불법주정차 단속", "이면도로에 노상 불법주정차가 지속되어 통행 불편 및 교통사고 위험에 따라 불법주정차 단속", "산업교통과"),
 ("과속 방지턱 설치", "어린이통학로 앞 과속 차량으로 통학 안전사고 위험에 따라 과속 방지턱 설치", "교통정책과"),
 ("신호등 고장 수리", "신호등 불량(야간 점등 불량)으로 교통사고 위험에 따라 신호등 수리", "교통정책과"),
 ("신호기 설치", "교차로 차량 정체 및 통행 불편에 따라 신호기 설치", "교통정책과"),
 ("중앙분리대 정비", "중앙분리대 파손으로 교통사고 위험에 따라 중앙분리대 정비", "교통정책과"),
 ("도로명판·주소표지판 정비", "도로명판(주소표지판)이 파손·상처되어 주소 식별 불편에 따라 표지판 정비", "교통정책과"),
 ("가로수 가지치기", "가로수 가지가 도로 위 전선(건물)에 접촉되어 안전사고 위험 및 시야 저해에 따라 가지치기", "공원녹지과"),
 ("공원 시설물 정비", "공원 내 운동기구·벤치 등이 노후·파손되어 이용 불편 및 안전사고 위험에 따라 시설물 정비", "공원녹지과"),
 ("공원 산책로 정비", "공원 산책로가 침식·파손되어 이용 불편에 따라 산책로 정비", "공원녹지과"),
 ("광고물 무단 게시 제거", "무단게시 광고물(현수막·벽보)이 도로·가로등에 게시되어 도시미관 저해 및 안전사고 위험에 따라 무단 광고물 제거", "건축과"),
 ("경관 위반 건축물 정비", "경관지구 내 위반 건축물(간판)로 도시미관 저해에 따라 위반 건축물 정비", "건축과"),
 ("도로 노면 재포장", "도로 노면이 노후·파손되어 차량 통행 시 진동·소음 발생에 따라 노면 재포장", "건설과"),
 ("보안등(횡단보도) 설치", "통학로(이해교차로) 횡단보도 인근 야간 시인성 저하로 안전사고 위험에 따라 보안등 설치", "건설과"),
 ("교통표지판 정비", "교통표지판(신호등)이 파손·상처되어 운전자 식별 불편에 따라 표지판 정비", "교통정책과"),
 ("하수관로 용량 확대", "하수관로 용량 부족으로 우천 시 배수 저하 및 침수 발생에 따라 하수관로 용량 확대", "건설과"),
 ("도로 안전 시설물 정비", "중앙분리대(신호등) 등 안전 시설물 노후로 사고 위험에 따라 안전 시설물 정비", "건설과"),
 ("공중화장실 정비", "공중화장실이 노후·파손되어 이용 불편에 따라 화장실 내부 정비", "공원녹지과"),
 ("주차장 노면 정비", "공영주차장 노면이 파손되어 주차 불편 및 안전사고 위험에 따라 노면 정비", "건설과"),
]

NAMES = ["김땡땡","박땡땡","이땡땡","최땡땡","정땡땡","한땡땡","장땡땡","임땡땡",
         "오땡땡","신땡땡","강땡땡","조땡땡","윤땡땡","홍땡땡","권땡땡","최금땡"]
AFFILS = ["마을주민","주민","자영업자","회사원","주부","공무원","학원강사","상점주"]
LANDMARKS = ["마트 입구","초등학교 후문","아파트 1동 옆","시외버스정류장 앞","약국 맞은편",
             "편의점 앞","정류장 인근","교차로 인근","공원 입구","시장 입구"]
SUJONG = ["추진중","추진중","추진중","추진중","추진중","추진중","추진중","추진중",
          "종결","종결","종결","불가"]

def weekday_ko(d):
    return "월화수목금토일"[d.weekday()]

def gen_date():
    start = date(2026, 3, 1)
    pool = []
    d = start
    while d <= date(2026, 8, 31):
        pool.append(d)
        d += timedelta(days=1)
    while True:
        d = random.choice(pool)
        if d.weekday() >= 5 and random.random() < 0.75:
            continue
        return d

def gen_date_str1(d):
    return f"{d.year:04d}.{d.month:02d}.{d.day:02d}.({weekday_ko(d)})"

def gen_date_str5(d):
    return f"{d.year}. {d.month}. {d.day}."

def gen_addr(dong):
    if random.random() < 0.5:
        street = random.choice(STREETS)
        num = random.randint(1, 200)
        suffix = random.choice(["", " 앞", " 인근", " 일대"])
        return f"{dong} {street}{num}{suffix}"
    else:
        ja = random.randint(1, 5)
        n1 = random.randint(1, 300)
        n2 = random.randint(1, 99)
        return f"{dong}{ja}가 {n1}-{n2}"

def gen_name(dong):
    r = random.random()
    if r < 0.30:
        return "익명"
    if r < 0.87:
        return random.choice(NAMES)
    return f"{dong}장"

def gen_affil():
    return random.choice(AFFILS)

def gen_phone():
    a = random.randint(0, 9)
    return f"010-0000-000{a}"

def gen_record():
    dong = random.choice(DONGS)
    title, situation, dept = random.choice(TYPES)
    d = gen_date()
    addr = gen_addr(dong)
    name = gen_name(dong)
    affil = dong + "장" if name.endswith("장") else gen_affil()
    landmark = random.choice(LANDMARKS) if random.random() < 0.5 else None
    return {
        "date": d,
        "date1": gen_date_str1(d),
        "date5": gen_date_str5(d),
        "dong": dong,
        "addr": addr,
        "addr_full": f"덕진구 {addr}",
        "landmark": landmark,
        "title": title,
        "title_full": f"{addr} {title} 요청",
        "situation": situation,
        "name": name,
        "affil": affil,
        "phone": gen_phone(),
        "dept": dept,
        "sujeong": random.choice(SUJONG),
    }

HP_T_RE = re.compile(r"<hp:t(?:\s[^>]*)?/>(?=<)|<hp:t(?:\s[^>]*)?>(.*?)</hp:t>", re.S)

def run_positions(xml):
    """(start, end) of each hp:t element in document order"""
    pos = []
    for m in HP_T_RE.finditer(xml):
        if m.group(1) is not None:
            inner_start = xml.index(">", m.start()) + 1
            pos.append((inner_start, m.end() - len("</hp:t>")))
        else:
            pos.append(None)
    return pos

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def replace_runs(xml, repl):
    pos = run_positions(xml)
    out = []
    last = 0
    for i, p in enumerate(pos):
        if p is None:
            continue
        s, e = p
        if i in repl:
            out.append(xml[last:s])
            out.append(esc(repl[i]))
            last = e
    out.append(xml[last:])
    return "".join(out)

def build_section1(r):
    loc = r["addr_full"] + (f"({r['landmark']})" if r["landmark"] else "")
    return {
        4: r["landmark"] or "",
        7: r["title_full"],
        9: r["date1"],
        11: f"{r['dong']}장",
        14: r["name"],
        17: r["affil"],
        19: r["phone"],
        21: f"  ○ 위치 : {loc}",
        22: f"  ○ 내용 : {r['situation']}",
        26: f"덕진 {r['dept']}",
    }

def build_section2(r):
    return {
        6: r["title_full"],
        8: r["date1"],
        10: f"{r['dong']}장",
        13: r["name"],
        16: r["affil"],
        18: r["phone"],
        20: f"  ○ 위치 : {r['addr_full']}",
        21: "  ○ 내용 : ",
        22: r["situation"],
        23: "  ",
        25: "",
        27: "", 28: "", 29: "", 30: "", 31: "",  # 사진 캡션 공백
        33: "", 35: "",
        38: f"덕진 {r['dept']}",
    }

def build_section5(r):
    return {
        3: f"{r['addr']} {r['title']} 요청 ",
        5: r["date5"],
        7: f"{r['dong']}장",
        8: r["name"],
        12: r["affil"],
        14: r["phone"],
        16: f" {r['addr']}",
        18: f"     - {r['situation']}함.",
        22: f"덕진 {r['dept']}",
    }

def build_from_template(template, repl, out_path):
    zin = zipfile.ZipFile(template, "r")
    try:
        items = zin.infolist()
        data = {}
        for it in items:
            data[it.filename] = zin.read(it.filename)
    finally:
        zin.close()
    xml = data["Contents/section0.xml"].decode("utf-8")
    data["Contents/section0.xml"] = replace_runs(xml, repl).encode("utf-8")
    with zipfile.ZipFile(out_path, "w") as zout:
        for it in items:
            zi = zipfile.ZipInfo(it.filename, date_time=it.date_time)
            zi.compress_type = it.compress_type
            zout.writestr(zi, data[it.filename])

def main():
    templates = {
        1: BASE / "테스트자료 1.hwpx",
        2: BASE / "테스트자료 2.hwpx",
        5: BASE / "테스트자료 5.hwpx",
    }
    builders = {1: build_section1, 2: build_section2, 5: build_section5}
    master = [gen_record() for _ in range(PER_FORM)]
    (OUT / "records.json").write_text(json.dumps(master, ensure_ascii=False, default=str), "utf-8")

    for form in (1, 2, 5):
        tpl = templates[form]
        b = builders[form]
        for i, r in enumerate(master, 1):
            out = OUT / f"수렴관리카드_{form}_{i:03d}_{r['date']:%Y%m%d}.hwpx"
            build_from_template(tpl, b(r), out)
        print(f"형식 {form}: {PER_FORM}건 완료", flush=True)
    print("전체 완료")

if __name__ == "__main__":
    main()
