#!/usr/bin/env python3
"""Markdown 보고서를 HWPX로 변환합니다. (python-hwpx 필요)

사용:
  .venv-hwpx/bin/python docs/md_to_hwpx_report.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "통합민원정보_서비스_기획_보고서.md"
OUT = ROOT / "report" / "통합민원정보_서비스_기획_보고서.hwpx"

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
TABLE_SEP_RE = re.compile(r"^\|[\s\-:|]+\|$")
BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
NUMBER_RE = re.compile(r"^(\d+)[.)]\s+(.*)$")
QUOTE_RE = re.compile(r"^>\s?(.*)$")
BOLD_RE = re.compile(r"\*\*(.+?)\*\*")


def strip_md(text: str) -> str:
    text = BOLD_RE.sub(r"\1", text)
    text = text.replace("`", "")
    return text.strip()


def parse_table_row(line: str) -> list[str]:
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return [strip_md(c) for c in cells]


def parse_blocks(md: str) -> list[dict]:
    lines = md.splitlines()
    blocks: list[dict] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        raw = line.rstrip()
        if not raw.strip() or raw.strip() == "---":
            i += 1
            continue

        m = HEADING_RE.match(raw)
        if m:
            blocks.append(
                {"type": "heading", "level": len(m.group(1)), "text": strip_md(m.group(2))}
            )
            i += 1
            continue

        qm = QUOTE_RE.match(raw)
        if qm:
            quote_lines = [strip_md(qm.group(1))]
            i += 1
            while i < n and QUOTE_RE.match(lines[i]):
                quote_lines.append(strip_md(QUOTE_RE.match(lines[i]).group(1)))
                i += 1
            blocks.append({"type": "quote", "text": " ".join(x for x in quote_lines if x)})
            continue

        if raw.lstrip().startswith("|") and "|" in raw[1:]:
            rows: list[list[str]] = []
            while i < n and lines[i].lstrip().startswith("|"):
                row_line = lines[i].rstrip()
                if TABLE_SEP_RE.match(row_line):
                    i += 1
                    continue
                rows.append(parse_table_row(row_line))
                i += 1
            if rows:
                cols = max(len(r) for r in rows)
                norm = [r + [""] * (cols - len(r)) for r in rows]
                blocks.append({"type": "table", "rows": norm})
            continue

        bm = BULLET_RE.match(raw)
        if bm:
            items = [strip_md(bm.group(1))]
            i += 1
            while i < n and BULLET_RE.match(lines[i]):
                items.append(strip_md(BULLET_RE.match(lines[i]).group(1)))
                i += 1
            blocks.append({"type": "bullet", "items": items})
            continue

        nm = NUMBER_RE.match(raw)
        if nm:
            items = [strip_md(nm.group(2))]
            i += 1
            while i < n and NUMBER_RE.match(lines[i]):
                items.append(strip_md(NUMBER_RE.match(lines[i]).group(2)))
                i += 1
            blocks.append({"type": "number", "items": items})
            continue

        # paragraph (merge consecutive non-special lines)
        para = [strip_md(raw)]
        i += 1
        while i < n:
            nxt = lines[i].rstrip()
            if (
                not nxt.strip()
                or nxt.strip() == "---"
                or HEADING_RE.match(nxt)
                or QUOTE_RE.match(nxt)
                or BULLET_RE.match(nxt)
                or NUMBER_RE.match(nxt)
                or (nxt.lstrip().startswith("|") and "|" in nxt[1:])
            ):
                break
            para.append(strip_md(nxt))
            i += 1
        text = " ".join(p for p in para if p)
        if text:
            blocks.append({"type": "para", "text": text})

    return blocks


def build_hwpx(blocks: list[dict], out_path: Path) -> None:
    from hwpx import HwpxDocument

    doc = HwpxDocument.new()

    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            level = min(max(block["level"], 1), 3)
            doc.add_heading(block["text"], level=level)
        elif kind == "para":
            doc.add_paragraph(block["text"])
        elif kind == "quote":
            doc.add_paragraph(f"「{block['text']}」")
        elif kind in ("bullet", "number"):
            start = len(doc.paragraphs)
            for item in block["items"]:
                doc.add_paragraph(item)
            end = len(doc.paragraphs)
            indexes = list(range(start, end))
            if indexes:
                doc.set_list_format(
                    paragraph_indexes=indexes,
                    kind="bullet" if kind == "bullet" else "number",
                )
        elif kind == "table":
            rows = block["rows"]
            nrows = len(rows)
            ncols = len(rows[0]) if rows else 0
            if nrows == 0 or ncols == 0:
                continue
            # A4 본문 폭에 맞춤 (약 42,000 HWPUNIT)
            table = doc.add_table(nrows, ncols, width=42000)
            for r, row in enumerate(rows):
                for c, cell in enumerate(row):
                    table.set_cell_text(r, c, cell)
                # 헤더 행 강조
                if r == 0:
                    for c in range(ncols):
                        try:
                            table.set_cell_shading(r, c, "#E7EEF7")
                        except Exception:
                            pass
            doc.add_paragraph("")  # 표 뒤 간격

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save_to_path(str(out_path))
    report = doc.validate()
    issues = getattr(report, "issues", ()) or ()
    if issues:
        print("검증 경고:", issues, file=sys.stderr)


def main() -> int:
    if not SRC.is_file():
        print(f"원본 없음: {SRC}", file=sys.stderr)
        return 1
    md = SRC.read_text(encoding="utf-8")
    blocks = parse_blocks(md)
    build_hwpx(blocks, OUT)
    print(f"생성 완료: {OUT}")
    print(f"블록 수: {len(blocks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
