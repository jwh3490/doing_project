import os
from functools import lru_cache
from urllib.parse import urlencode

from .festival import _fetch_json, _image_url


FOOD_API_URL = "https://apis.data.go.kr/6260000/FoodService/getFoodKr"


def _text(value) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


@lru_cache(maxsize=2)
def _load_restaurants(service_key: str) -> tuple[dict, ...]:
    query = urlencode(
        {"ServiceKey": service_key, "pageNo": 1, "numOfRows": 500, "resultType": "json"},
        safe="%",
    )
    payload = _fetch_json(f"{FOOD_API_URL}?{query}")
    response = payload.get("getFoodKr", payload.get("response", payload))
    header = response.get("header", {})
    if str(header.get("resultCode", "00")) != "00":
        raise ValueError(header.get("resultMsg") or "부산 맛집 API가 오류를 반환했습니다.")

    body = response.get("body", response)
    container = body.get("items", body.get("item", []))
    items = container.get("item", []) if isinstance(container, dict) else container
    if isinstance(items, dict):
        items = [items]

    restaurants = []
    for item in items:
        restaurants.append({
            "id": str(item.get("UC_SEQ") or ""),
            "name": _text(item.get("MAIN_TITLE") or item.get("PLACE")) or "이름 없는 맛집",
            "district": _text(item.get("GUGUN_NM")) or "기타",
            "place": _text(item.get("PLACE")),
            "title": _text(item.get("TITLE")),
            "subtitle": _text(item.get("SUBTITLE")),
            "address": " ".join(filter(None, [_text(item.get("ADDR1")), _text(item.get("ADDR2"))])),
            "contact": _text(item.get("CNTCT_TEL")),
            "homepage": _text(item.get("HOMEPAGE_URL")),
            "hours": _text(item.get("USAGE_DAY_WEEK_AND_TIME")),
            "menu": _text(item.get("RPRSNTV_MENU")),
            "description": _text(item.get("ITEMCNTNTS")),
            "image": _image_url(_text(item.get("MAIN_IMG_NORMAL") or item.get("MAIN_IMG_THUMB"))),
            "thumbnail": _image_url(_text(item.get("MAIN_IMG_THUMB") or item.get("MAIN_IMG_NORMAL"))),
            "lat": _text(item.get("LAT")),
            "lng": _text(item.get("LNG")),
        })
    return tuple(restaurants)


def restaurant_directory(
    service_key: str | None = None,
    query: str = "",
    district: str = "",
    page: int = 1,
    page_size: int = 24,
) -> dict:
    key = service_key or os.getenv("DATA_GO_KR_SERVICE_KEY")
    if not key:
        raise ValueError("DATA_GO_KR_SERVICE_KEY 환경변수에 공공데이터포털 인증키를 설정해 주세요.")

    all_restaurants = list(_load_restaurants(key))
    districts = sorted({item["district"] for item in all_restaurants})
    search = query.strip().casefold()
    filtered = [
        item for item in all_restaurants
        if (not district or item["district"] == district)
        and (
            not search
            or search in " ".join(filter(None, [item["name"], item["address"], item["menu"]])).casefold()
        )
    ]
    start = (page - 1) * page_size
    return {
        "restaurants": filtered[start:start + page_size],
        "districts": districts,
        "total_count": len(filtered),
        "page": page,
        "page_size": page_size,
        "source": "부산광역시_부산맛집정보 서비스",
    }
