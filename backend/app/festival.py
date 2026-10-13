import json
import os
import re
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


FESTIVAL_API_URL = "https://apis.data.go.kr/6260000/FestivalService/getFestivalKr"


def _parse_date(value: str) -> str | None:
    match = re.search(r"(20\d{2})\s*[.년/-]\s*(\d{1,2})\s*[.월/-]\s*(\d{1,2})", value or "")
    if not match:
        return None
    try:
        return date(*(int(part) for part in match.groups())).isoformat()
    except ValueError:
        return None


def _date_range(value: str) -> tuple[str | None, str | None]:
    matches = re.findall(r"(20\d{2})\s*[.년/-]\s*(\d{1,2})\s*[.월/-]\s*(\d{1,2})", value or "")
    parsed = []
    for parts in matches[:2]:
        try:
            parsed.append(date(*(int(part) for part in parts)).isoformat())
        except ValueError:
            continue
    if parsed:
        start = parsed[0]
        if len(parsed) == 1:
            tail = (value or "").split("~", 1)[-1]
            short_end = re.search(r"(\d{1,2})\s*[.월/-]\s*(\d{1,2})", tail)
            if short_end:
                try:
                    inherited = date(int(start[:4]), int(short_end.group(1)), int(short_end.group(2))).isoformat()
                    return start, inherited
                except ValueError:
                    pass
        return parsed[0], parsed[-1]
    single = _parse_date(value)
    return single, single


def _image_url(value: str | None) -> str | None:
    if not value:
        return None
    if value.startswith(("http://", "https://")):
        return value
    return f"https://www.visitbusan.net{value if value.startswith('/') else '/' + value}"


def _fetch_json(url: str, timeout: float = 10.0) -> dict:
    try:
        with urlopen(url, timeout=timeout) as response:  # noqa: S310 - fixed government API host
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError("부산 축제 API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.") from error


def festival_calendar(service_key: str | None = None) -> dict:
    key = service_key or os.getenv("DATA_GO_KR_SERVICE_KEY")
    if not key:
        raise ValueError("DATA_GO_KR_SERVICE_KEY 환경변수에 공공데이터포털 인증키를 설정해 주세요.")

    query = urlencode(
        {"ServiceKey": key, "pageNo": 1, "numOfRows": 200, "resultType": "json"},
        safe="%",
    )
    payload = _fetch_json(f"{FESTIVAL_API_URL}?{query}")
    response = payload.get("response", payload)
    if "header" not in response and len(response) == 1:
        response = next(iter(response.values()))
    header = response.get("header", {})
    if str(header.get("resultCode", "00")) != "00":
        raise ValueError(header.get("resultMsg") or "부산 축제 API가 오류를 반환했습니다.")

    body = response.get("body", response)
    item_container = body.get("items", body.get("item", []))
    items = item_container.get("item", []) if isinstance(item_container, dict) else item_container
    if isinstance(items, dict):
        items = [items]

    events = []
    undated = []
    for item in items:
        period_text = str(item.get("USAGE_DAY") or item.get("USAGE_DAY_WEEK_AND_TIME") or "")
        start_date, end_date = _date_range(period_text)
        event = {
            "id": str(item.get("UC_SEQ") or ""),
            "title": item.get("MAIN_TITLE") or item.get("TITLE") or "이름 없는 축제",
            "subtitle": item.get("SUBTITLE") or item.get("TITLE"),
            "district": item.get("GUGUN_NM"),
            "place": item.get("MAIN_PLACE") or item.get("PLACE"),
            "address": " ".join(filter(None, [item.get("ADDR1"), item.get("ADDR2")])),
            "contact": item.get("CNTCT_TEL"),
            "homepage": item.get("HOMEPAGE_URL"),
            "period_text": period_text,
            "hours": item.get("USAGE_DAY_WEEK_AND_TIME"),
            "price": item.get("USAGE_AMOUNT"),
            "description": item.get("ITEMCNTNTS"),
            "image": _image_url(item.get("MAIN_IMG_NORMAL") or item.get("MAIN_IMG_THUMB")),
            "start_date": start_date,
            "end_date": end_date,
        }
        (events if start_date else undated).append(event)

    events.sort(key=lambda event: (event["start_date"], event["title"]))
    return {
        "events": events,
        "undated": undated,
        "total_count": int(body.get("totalCount") or len(items)),
        "source": "부산광역시_부산축제정보 서비스",
        "source_updated": "2025-05-26",
    }
