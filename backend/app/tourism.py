from __future__ import annotations

import csv
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "foreign_tourists"
ROUTES = ("부산 공항", "부산 항구", "타지 경유")


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _read_xlsx(path: Path) -> list[dict[str, str]]:
    """Read the simple first worksheet without adding an Excel dependency."""
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as workbook:
        strings_root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
        strings = [
            "".join(node.text or "" for node in item.findall(".//x:t", ns))
            for item in strings_root.findall("x:si", ns)
        ]
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    rows: list[list[str]] = []
    for row in sheet.findall(".//x:sheetData/x:row", ns):
        values: list[str] = []
        for cell in row.findall("x:c", ns):
            value_node = cell.find("x:v", ns)
            value = "" if value_node is None else value_node.text or ""
            if cell.get("t") == "s" and value:
                value = strings[int(value)]
            values.append(value)
        rows.append(values)
    if not rows:
        return []
    return [dict(zip(rows[0], row)) for row in rows[1:]]


def _number(value: object) -> int:
    try:
        return int(round(float(str(value).replace(",", ""))))
    except (TypeError, ValueError):
        return 0


def tourism_summary() -> dict:
    monthly: list[dict] = []
    route_totals = {route: 0 for route in ROUTES}

    for path in sorted(DATA_DIR.glob("20*.*")):
        year = int(path.stem)
        rows = _read_xlsx(path) if path.suffix.lower() == ".xlsx" else _read_csv(path)
        for row in rows:
            nationality = row.get("국적", "")
            if nationality != "총계":
                continue
            raw_month = row.get("월", "")
            match = re.search(r"\d+", str(raw_month))
            if not match:
                continue
            month = int(match.group())
            routes = {route: _number(row.get(route)) for route in ROUTES}
            total = _number(row.get("부산 합계")) or sum(routes.values())
            for route, count in routes.items():
                route_totals[route] += count
            monthly.append({
                "month": f"{year:04d}-{month:02d}",
                "visitors": total,
                "airport": routes["부산 공항"],
                "port": routes["부산 항구"],
                "via_other_region": routes["타지 경유"],
            })

    monthly.sort(key=lambda point: point["month"])
    for index, point in enumerate(monthly):
        previous = monthly[index - 1]["visitors"] if index else 0
        point["change_rate"] = round((point["visitors"] - previous) / previous * 100, 1) if previous else None

    positive_changes = [point for point in monthly if point["change_rate"] is not None and point["change_rate"] > 0]
    spikes = sorted(positive_changes, key=lambda point: point["change_rate"], reverse=True)[:5]
    route_sum = sum(route_totals.values())
    route_labels = {"부산 공항": "부산공항", "부산 항구": "부산항", "타지 경유": "타 지역 경유"}
    routes = [
        {
            "route": route_labels[name],
            "count": count,
            "ratio": round(count / route_sum * 100, 1) if route_sum else 0,
        }
        for name, count in route_totals.items()
    ]
    latest = monthly[-1] if monthly else None
    return {
        "period_start": monthly[0]["month"] if monthly else None,
        "period_end": latest["month"] if latest else None,
        "total_visitors": sum(point["visitors"] for point in monthly),
        "latest_visitors": latest["visitors"] if latest else 0,
        "latest_change_rate": latest["change_rate"] if latest else None,
        "series": monthly,
        "spikes": spikes,
        "routes": routes,
        "source": "부산관광공사 외국인 관광객 부산방문 동향 통합(2021~2026)",
        "assumption": "각 월의 '총계' 행에 있는 부산 합계를 부산 외국인 관광객 전체로 간주했습니다.",
    }
