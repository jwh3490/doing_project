from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile


CRUISE_DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "부산크루즈입항_2024-2026_월별통합.xlsx"
)
XML_NAMESPACE = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


@dataclass(frozen=True)
class CruiseRecord:
    terminal: str
    month: str
    capacity: int
    port: str


def load_cruise_records(path: Path = CRUISE_DATA_PATH) -> list[CruiseRecord]:
    """Read the small source workbook without requiring an Excel dependency."""
    if not path.is_file():
        raise ValueError(f"크루즈 입항 자료를 찾을 수 없습니다: {path.name}")

    try:
        with zipfile.ZipFile(path) as workbook:
            sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    except (KeyError, zipfile.BadZipFile, ET.ParseError) as error:
        raise ValueError("크루즈 입항 엑셀 파일을 읽을 수 없습니다.") from error

    records: list[CruiseRecord] = []
    rows = sheet.findall(f".//{XML_NAMESPACE}row")
    for row in rows[1:]:
        values: dict[str, str] = {}
        for cell in row.findall(f"{XML_NAMESPACE}c"):
            reference = cell.attrib.get("r", "")
            match = re.match(r"([A-Z]+)", reference)
            value = cell.find(f"{XML_NAMESPACE}v")
            if match and value is not None:
                values[match.group(1)] = value.text or ""

        try:
            records.append(
                CruiseRecord(
                    terminal=values["A"].strip(),
                    month=values["B"][:7],
                    capacity=int(float(values["C"])),
                    port=values["D"].strip(),
                )
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("크루즈 입항 자료에 읽을 수 없는 행이 있습니다.") from error

    if not records:
        raise ValueError("크루즈 입항 자료가 비어 있습니다.")
    return records


def cruise_summary(today: date | None = None) -> dict:
    records = load_cruise_records()
    today = today or date.today()
    current_month = today.strftime("%Y-%m")

    months: dict[str, list[CruiseRecord]] = {}
    for record in records:
        months.setdefault(record.month, []).append(record)

    series = []
    for month, month_records in sorted(months.items()):
        calls = len(month_records)
        capacity = sum(record.capacity for record in month_records)
        series.append(
            {
                "month": month,
                "calls": calls,
                "capacity": capacity,
                "status": "예정" if month > current_month else "기록",
                "recorded_calls": calls,
                "recorded_capacity": capacity,
                "estimated_calls": None,
                "estimated_capacity": None,
            }
        )

    data_period_end = series[-1]["month"]
    data_end_year, data_end_month = (int(part) for part in data_period_end.split("-"))
    estimate_series = []
    for offset in range(1, 13):
        month_index = data_end_month - 1 + offset
        target_year = data_end_year + month_index // 12
        target_month = month_index % 12 + 1
        target = f"{target_year:04d}-{target_month:02d}"
        reference_months = sorted(
            month for month in months if int(month[5:7]) == target_month
        )
        monthly_calls = [len(months[month]) for month in reference_months]
        monthly_capacities = [
            sum(record.capacity for record in months[month])
            for month in reference_months
        ]
        calls = int(round(sum(monthly_calls) / len(monthly_calls))) if monthly_calls else 0
        capacity = (
            int(round(sum(monthly_capacities) / len(monthly_capacities)))
            if monthly_capacities
            else 0
        )
        estimate_series.append(
            {
                "month": target,
                "calls": calls,
                "capacity": capacity,
                "status": "추정",
                "estimate_basis": f"{reference_months[0]}~{reference_months[-1]} 동월 평균",
                "recorded_calls": None,
                "recorded_capacity": None,
                "estimated_calls": calls,
                "estimated_capacity": capacity,
            }
        )

    series.extend(estimate_series)

    port_counts = Counter(record.port for record in records)
    terminal_counts = Counter(record.terminal for record in records)
    return {
        "source_file": CRUISE_DATA_PATH.name,
        "period_start": series[0]["month"],
        "period_end": series[-1]["month"],
        "data_period_end": data_period_end,
        "estimate_start": estimate_series[0]["month"],
        "estimate_end": estimate_series[-1]["month"],
        "estimated_calls": sum(point["calls"] for point in estimate_series),
        "estimated_capacity": sum(point["capacity"] for point in estimate_series),
        "total_calls": len(records),
        "total_capacity": sum(record.capacity for record in records),
        "scheduled_calls": sum(1 for record in records if record.month > current_month),
        "series": series,
        "top_ports": [
            {"port": port, "calls": calls}
            for port, calls in port_counts.most_common(8)
        ],
        "terminals": [
            {"terminal": terminal, "calls": calls}
            for terminal, calls in terminal_counts.most_common()
        ],
        "records": [
            {
                "month": record.month,
                "terminal": record.terminal,
                "capacity": record.capacity,
                "port": record.port,
                "status": "예정" if record.month > current_month else "기록",
            }
            for record in sorted(records, key=lambda item: (item.month, item.port), reverse=True)
        ],
    }
