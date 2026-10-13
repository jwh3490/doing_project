import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from dotenv import load_dotenv

from .data import AirportData, load_data
from .cruise import cruise_summary
from .forecast import forecast_months
from .festival import festival_calendar
from .restaurant import restaurant_directory


load_dotenv()


app = FastAPI(title="김해공항 국제선 여객 분석 API")


def _load_or_error() -> AirportData:
    try:
        return load_data()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/cruise")
def cruise() -> dict:
    try:
        return cruise_summary()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/festivals")
def festivals() -> dict:
    try:
        return festival_calendar()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/restaurants")
def restaurants(
    q: str = Query(default="", max_length=100),
    district: str = Query(default="", max_length=30),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=500),
) -> dict:
    try:
        return restaurant_directory(query=q, district=district, page=page, page_size=page_size)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/dashboard")
def dashboard() -> dict:
    dataset = _load_or_error()
    try:
        forecast = forecast_months(dataset.monthly_total, horizon=6)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    last_month = dataset.monthly_total.index[-1]
    previous_year_month = last_month - pd.DateOffset(years=1)
    previous_year_value = dataset.monthly_total.get(previous_year_month)
    latest_value = float(dataset.monthly_total.iloc[-1])
    yoy_change_percent = None
    if previous_year_value is not None and previous_year_value != 0:
        yoy_change_percent = (latest_value - float(previous_year_value)) / float(previous_year_value) * 100

    return {
        **forecast,
        "last_actual_month": last_month.strftime("%Y-%m"),
        "latest_value": int(round(latest_value)),
        "yoy_comparison_month": previous_year_month.strftime("%Y-%m") if previous_year_value is not None else None,
        "yoy_change_percent": yoy_change_percent,
        "zero_months": dataset.zero_months,
        "data_notice": (
            "2020년 5~11월은 원본 파일에 0으로 기록되어 그대로 사용했습니다."
            if dataset.zero_months
            else None
        ),
    }


@app.get("/api/airports")
def airports() -> dict:
    dataset = _load_or_error()
    international_rows = dataset.airport_rows[dataset.airport_rows["country"] != "대한민국"]
    airport_info = (
        international_rows[["airport", "code", "country"]]
        .drop_duplicates()
        .sort_values(["country", "airport"])
    )
    latest_rows = international_rows[
        international_rows["month"] == dataset.monthly_total.index[-1]
    ]
    recent_totals = latest_rows.groupby("airport")["passengers"].sum().sort_values(ascending=False)
    default_airport = str(recent_totals.index[0]) if not recent_totals.empty else (names[0] if names else None)
    return {
        "airports": [
            {"name": row.airport, "code": row.code, "country": row.country}
            for row in airport_info.itertuples(index=False)
        ],
        "default_airport": default_airport,
    }


@app.get("/api/airport-trend")
def airport_trend(name: str = Query(min_length=1)) -> dict:
    dataset = _load_or_error()
    rows = dataset.airport_rows[dataset.airport_rows["airport"] == name]
    if rows.empty:
        raise HTTPException(status_code=404, detail="선택한 출발 공항의 자료가 없습니다.")
    if str(rows.iloc[0]["country"]) == "대한민국":
        raise HTTPException(status_code=404, detail="국내 공항은 출발 공항 분석 대상에서 제외됩니다.")

    monthly = rows.groupby("month")["passengers"].sum()
    full_months = pd.date_range(dataset.monthly_total.index[0], dataset.monthly_total.index[-1], freq="MS")
    aligned = monthly.reindex(full_months)
    series = [
        {
            "month": month.strftime("%Y-%m"),
            "actual": int(round(float(value))) if pd.notna(value) else None,
        }
        for month, value in aligned.items()
    ]
    return {
        "airport": name,
        "code": str(rows.iloc[0]["code"]),
        "country": str(rows.iloc[0]["country"]),
        "series": series,
    }
