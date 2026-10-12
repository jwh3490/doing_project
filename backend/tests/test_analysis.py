from pathlib import Path

import pandas as pd
import pytest

from backend.app.data import RAW_DATA_PATH, load_data
from backend.app.forecast import forecast_months


def test_source_data_has_complete_monthly_totals_and_airport_sums() -> None:
    dataset = load_data(RAW_DATA_PATH)

    assert len(dataset.monthly_total) == 213
    assert dataset.monthly_total.index[0] == pd.Timestamp("2009-01-01")
    assert dataset.monthly_total.index[-1] == pd.Timestamp("2026-09-01")
    assert len(dataset.airport_rows) == 6676
    assert dataset.zero_months == [
        "2020.05",
        "2020.06",
        "2020.07",
        "2020.08",
        "2020.09",
        "2020.10",
        "2020.11",
    ]

    airport_totals = dataset.airport_rows.groupby("month")["passengers"].sum()
    airport_totals = airport_totals.reindex(dataset.monthly_total.index, fill_value=0)
    pd.testing.assert_series_equal(
        dataset.monthly_total,
        airport_totals.astype(float).rename("국제선도착여객수_명"),
    )


def test_forecast_covers_six_months_after_latest_observation() -> None:
    dataset = load_data(RAW_DATA_PATH)
    result = forecast_months(dataset.monthly_total, horizon=6)

    assert result["forecast_start"] == "2026-10"
    assert result["forecast_end"] == "2027-03"
    assert len(result["series"]) == len(dataset.monthly_total) + 6
    assert result["selected_method"] in {"계절 기준선", "Holt-Winters"}
    assert {score["method"] for score in result["model_scores"]} == {
        "계절 기준선",
        "Holt-Winters",
    }
    future = result["series"][-6:]
    assert all(point["forecast"] >= 0 for point in future)
    assert all(point["lower"] <= point["forecast"] <= point["upper"] for point in future)


def test_missing_csv_has_a_beginner_friendly_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="데이터 파일을 찾을 수 없습니다"):
        load_data(tmp_path / "missing.csv")