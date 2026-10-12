import pandas as pd
from fastapi import FastAPI, HTTPException, Query

from .data import AirportData, load_data
from .forecast import forecast_months


app = FastAPI(title="김해공항 국제선 여객 분석 API")


def _load_or_error() -> AirportData:
    try:
        return load_data()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    names = sorted(dataset.airport_rows["airport"].dropna().unique().tolist())
    latest_rows = dataset.airport_rows[
        dataset.airport_rows["month"] == dataset.monthly_total.index[-1]
    ]
    recent_totals = latest_rows.groupby("airport")["passengers"].sum().sort_values(ascending=False)
    default_airport = str(recent_totals.index[0]) if not recent_totals.empty else (names[0] if names else None)
    return {"airports": names, "default_airport": default_airport}


@app.get("/api/airport-trend")
def airport_trend(name: str = Query(min_length=1)) -> dict:
    dataset = _load_or_error()
    rows = dataset.airport_rows[dataset.airport_rows["airport"] == name]
    if rows.empty:
        raise HTTPException(status_code=404, detail="선택한 출발 공항의 자료가 없습니다.")

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
    return {"airport": name, "series": series}