from datetime import date

from backend.app.cruise import cruise_summary


def test_cruise_summary_extends_source_with_one_year_of_seasonal_estimates() -> None:
    result = cruise_summary(today=date(2026, 10, 17))

    assert result["data_period_end"] == "2026-12"
    assert result["estimate_start"] == "2027-01"
    assert result["estimate_end"] == "2027-12"
    assert result["period_end"] == "2027-12"

    by_month = {point["month"]: point for point in result["series"]}
    assert by_month["2027-01"]["status"] == "추정"
    january_history = [
        point
        for point in result["series"]
        if point["month"].endswith("-01") and point["status"] != "추정"
    ]
    assert by_month["2027-01"]["calls"] == round(
        sum(point["calls"] for point in january_history) / len(january_history)
    )
    assert by_month["2027-01"]["capacity"] == round(
        sum(point["capacity"] for point in january_history) / len(january_history)
    )
    assert by_month["2027-01"]["estimate_basis"] == "2025-01~2026-01 동월 평균"
    assert by_month["2026-12"]["estimated_calls"] is None
