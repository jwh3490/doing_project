from dataclasses import dataclass
from pathlib import Path

import pandas as pd


RAW_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "airport_international_arrivals.csv"
REQUIRED_COLUMNS = {"연도", "월", "행구분", "출발공항명", "출발공항코드", "국제선도착여객수_명"}

COUNTRY_CODES = {
    "대한민국": "GMP PUS ICN",
    "일본": "KIX KMQ KMJ NGS NGO TAK TOY NRT HND MYJ KMI HSG CTS SHI FSZ OKJ OKA OSA OIT KOJ KKJ FUK HIJ AKJ",
    "중국": "KWL CAN KWE NKG KHN NGB DLC MDG PEK SYX XMN XUZ SJW XIY SHE ENH YNJ YNT DSN URC WUX WUH WEH YIH DYG CGQ CGO TNA JJN CSX TAO CTU CKG NDG KMG TYN TFU TXN PVG HRB HAK HGH HFE HET",
    "베트남": "CXR DAD DLI PQC HAN SGN",
    "인도네시아": "DPS BTH",
    "대만": "RMQ KHH TPE HUN",
    "미얀마": "RGN",
    "미국": "LAX MGM MSP ORD SUU PDX",
    "미국령 괌": "GUM",
    "미국령 사이판": "SPN",
    "필리핀": "MNL CEB KLO CRK TAG PPS",
    "마카오": "MFM",
    "독일": "MUC",
    "브루나이": "BWN",
    "태국": "BKK CEI CNX HKT",
    "우크라이나": "KBP",
    "몽골": "ULN UBN",
    "러시아": "VVO KJA KHV",
    "라오스": "VTE",
    "싱가포르": "SIN",
    "캄보디아": "REP SAI",
    "에티오피아": "ADD",
    "카자흐스탄": "ALA",
    "말레이시아": "BKI KUL",
    "우즈베키스탄": "TAS",
    "캐나다": "YYZ",
    "홍콩": "HKG",
}
COUNTRY_BY_IATA = {
    code: country
    for country, codes in COUNTRY_CODES.items()
    for code in codes.split()
}


@dataclass(frozen=True)
class AirportData:
    monthly_total: pd.Series
    airport_rows: pd.DataFrame
    zero_months: list[str]


def load_data(csv_path: Path = RAW_DATA_PATH) -> AirportData:
    if not csv_path.is_file():
        raise ValueError(
            "데이터 파일을 찾을 수 없습니다. "
            "data/raw/airport_international_arrivals.csv 위치에 CSV 파일을 두어 주세요."
        )

    try:
        frame = pd.read_csv(csv_path, encoding="utf-8-sig")
    except (UnicodeDecodeError, pd.errors.ParserError) as error:
        raise ValueError("CSV를 읽을 수 없습니다. UTF-8 형식의 CSV인지 확인해 주세요.") from error

    missing_columns = REQUIRED_COLUMNS.difference(frame.columns)
    if missing_columns:
        columns = ", ".join(sorted(missing_columns))
        raise ValueError(f"CSV에 필요한 열이 없습니다: {columns}")

    frame = frame.copy()
    frame["행구분"] = frame["행구분"].astype("string").str.strip()
    frame["출발공항명"] = frame["출발공항명"].astype("string").str.strip()
    frame["출발공항코드"] = frame["출발공항코드"].astype("string").str.strip()

    for column in ("연도", "월", "국제선도착여객수_명"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    invalid_values = frame[["연도", "월", "국제선도착여객수_명"]].isna().any(axis=1)
    invalid_months = ~frame["월"].between(1, 12)
    if invalid_values.any() or invalid_months.any():
        raise ValueError("연도, 월 또는 여객 수에 비어 있거나 잘못된 값이 있습니다.")
    if (frame["국제선도착여객수_명"] < 0).any():
        raise ValueError("여객 수에 음수가 있습니다. 원본 데이터를 확인해 주세요.")

    frame["month"] = pd.to_datetime(
        {
            "year": frame["연도"].astype(int),
            "month": frame["월"].astype(int),
            "day": 1,
        },
        errors="coerce",
    )
    if frame["month"].isna().any():
        raise ValueError("연도와 월을 날짜로 바꿀 수 없습니다. 날짜 값을 확인해 주세요.")

    total_rows = frame[frame["행구분"] == "월합계"].copy()
    if total_rows.empty:
        raise ValueError("CSV에서 월합계 행을 찾을 수 없습니다.")
    if total_rows["month"].duplicated().any():
        raise ValueError("같은 월의 합계가 여러 번 있습니다. 중복 자료를 확인해 주세요.")

    monthly_total = (
        total_rows.set_index("month")["국제선도착여객수_명"].astype(float).sort_index()
    )
    monthly_total.index.name = "month"
    expected_months = pd.date_range(monthly_total.index.min(), monthly_total.index.max(), freq="MS")
    missing_months = expected_months.difference(monthly_total.index)
    if not missing_months.empty:
        first_missing = missing_months[0].strftime("%Y.%m")
        raise ValueError(f"월별 합계 자료가 중간에 빠져 있습니다. 처음 누락된 달: {first_missing}")

    airport_rows = frame[frame["행구분"] == "공항별"][["month", "출발공항명", "출발공항코드", "국제선도착여객수_명"]]
    airport_rows = airport_rows.rename(
        columns={"출발공항명": "airport", "출발공항코드": "code", "국제선도착여객수_명": "passengers"}
    )
    airport_rows["country"] = airport_rows["code"].map(COUNTRY_BY_IATA).fillna("국가 미확인")
    if airport_rows.empty or airport_rows["airport"].isna().any() or (airport_rows["airport"] == "").any():
        raise ValueError("출발 공항별 자료가 비어 있거나 공항 이름이 없습니다.")

    airport_totals = airport_rows.groupby("month")["passengers"].sum().reindex(monthly_total.index, fill_value=0)
    mismatched_months = monthly_total.index[(monthly_total - airport_totals).abs() > 0.5]
    if len(mismatched_months):
        first_mismatch = mismatched_months[0].strftime("%Y.%m")
        raise ValueError(f"공항별 합과 월합계가 일치하지 않습니다. 확인이 필요한 달: {first_mismatch}")

    zero_months = [month.strftime("%Y.%m") for month in monthly_total.index[monthly_total == 0]]
    return AirportData(
        monthly_total=monthly_total,
        airport_rows=airport_rows,
        zero_months=zero_months,
    )
