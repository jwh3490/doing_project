from collections import defaultdict
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing


BASELINE_METHOD = "계절 기준선"
MODEL_METHOD = "Holt-Winters"


def _seasonal_naive(history: pd.Series, target_months: pd.DatetimeIndex) -> pd.Series:
    history_by_month = history.to_dict()
    reference_months = target_months - pd.DateOffset(years=1)
    values = [history_by_month.get(month, np.nan) for month in reference_months]
    return pd.Series(values, index=target_months, dtype=float)


def _holt_winters(history: pd.Series, target_months: pd.DatetimeIndex) -> pd.Series:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = ExponentialSmoothing(
            history.astype(float),
            trend="add",
            damped_trend=True,
            seasonal="add",
            seasonal_periods=12,
            initialization_method="estimated",
        )
        fitted = model.fit(optimized=True)
        values = fitted.forecast(len(target_months)).to_numpy(dtype=float)
    return pd.Series(np.maximum(values, 0), index=target_months)


def _mean_absolute_error(errors: list[float]) -> float | None:
    return float(np.mean(errors)) if errors else None


def forecast_months(history: pd.Series, horizon: int = 6) -> dict:
    history = history.sort_index().astype(float)
    if horizon < 1:
        raise ValueError("예측 기간은 1개월 이상이어야 합니다.")
    if len(history) < 36:
        raise ValueError("월별 자료가 36개월보다 적어 계절 예측을 검증하기 어렵습니다.")

    horizon = int(horizon)
    first_origin = max(36, len(history) - horizon * 5)
    origins = list(range(first_origin, len(history) - horizon + 1, horizon))
    baseline_errors: list[float] = []
    model_errors: list[float] = []
    baseline_errors_by_lead: dict[int, list[float]] = defaultdict(list)
    model_errors_by_lead: dict[int, list[float]] = defaultdict(list)

    for origin in origins:
        training = history.iloc[:origin]
        actual = history.iloc[origin : origin + horizon]
        baseline = _seasonal_naive(training, actual.index)
        if baseline.isna().any():
            continue

        baseline_residuals = (actual - baseline).abs().to_numpy(dtype=float)
        baseline_errors.extend(baseline_residuals.tolist())
        for lead, error in enumerate(baseline_residuals):
            baseline_errors_by_lead[lead].append(float(error))

        try:
            model_prediction = _holt_winters(training, actual.index)
        except (ValueError, np.linalg.LinAlgError, FloatingPointError):
            continue

        model_residuals = (actual - model_prediction).abs().to_numpy(dtype=float)
        model_errors.extend(model_residuals.tolist())
        for lead, error in enumerate(model_residuals):
            model_errors_by_lead[lead].append(float(error))

    baseline_mae = _mean_absolute_error(baseline_errors)
    model_mae = _mean_absolute_error(model_errors)
    if baseline_mae is None:
        raise ValueError("계절 기준 예측을 검증할 과거 자료가 충분하지 않습니다.")

    selected_method = MODEL_METHOD if model_mae is not None and model_mae < baseline_mae else BASELINE_METHOD
    future_months = pd.date_range(
        history.index[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS"
    )
    baseline_future = _seasonal_naive(history, future_months)
    if baseline_future.isna().any():
        raise ValueError("작년 같은 달의 값을 찾을 수 없어 기준 예측을 만들 수 없습니다.")

    try:
        model_future = _holt_winters(history, future_months)
    except (ValueError, np.linalg.LinAlgError, FloatingPointError):
        model_future = baseline_future.copy()
        if selected_method == MODEL_METHOD:
            selected_method = BASELINE_METHOD

    selected_future = model_future if selected_method == MODEL_METHOD else baseline_future
    selected_errors = model_errors_by_lead if selected_method == MODEL_METHOD else baseline_errors_by_lead
    pooled_errors = [error for values in selected_errors.values() for error in values]
    pooled_margin = float(np.quantile(pooled_errors, 0.9)) if pooled_errors else 0.0

    records = [
        {
            "month": month.strftime("%Y-%m"),
            "actual": int(round(value)),
            "forecast": None,
            "baseline": None,
            "lower": None,
            "upper": None,
            "range_width": None,
        }
        for month, value in history.items()
    ]
    for lead, month in enumerate(future_months):
        predicted = max(0.0, float(selected_future.loc[month]))
        baseline_value = max(0.0, float(baseline_future.loc[month]))
        errors_for_lead = selected_errors.get(lead, [])
        margin = float(np.quantile(errors_for_lead, 0.9)) if len(errors_for_lead) >= 3 else pooled_margin
        lower = max(0.0, predicted - margin)
        upper = predicted + margin
        records.append(
            {
                "month": month.strftime("%Y-%m"),
                "actual": None,
                "forecast": int(round(predicted)),
                "baseline": int(round(baseline_value)),
                "lower": int(round(lower)),
                "upper": int(round(upper)),
                "range_width": int(round(max(0.0, upper - lower))),
            }
        )

    return {
        "selected_method": selected_method,
        "forecast_start": future_months[0].strftime("%Y-%m"),
        "forecast_end": future_months[-1].strftime("%Y-%m"),
        "forecast_total": int(round(float(selected_future.sum()))),
        "model_scores": [
            {"method": BASELINE_METHOD, "mae": baseline_mae},
            {"method": MODEL_METHOD, "mae": model_mae},
        ],
        "series": records,
    }