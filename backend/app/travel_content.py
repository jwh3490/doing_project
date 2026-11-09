import os
from functools import lru_cache
from urllib.parse import urlencode

from .festival import _fetch_json, _image_url


TRAVEL_APIS = (
    {
        "id": "maritime",
        "name": "해양·체험",
        "description": "바다와 함께 즐기는 체험형 부산 여행",
        "url": "https://apis.data.go.kr/6260000/MarintimeService/getMaritimeKr",
        "root": "getMaritimeKr",
        "source": "부산 해양체험정보 서비스",
    },
    {
        "id": "theme",
        "name": "부산 테마여행",
        "description": "문화, 역사, 명소를 엮은 부산 추천 여행",
        "url": "https://apis.data.go.kr/6260000/RecommendedService/getRecommendedKr",
        "root": "getRecommendedKr",
        "source": "부산광역시 테마여행정보 서비스",
    },
    {
        "id": "walking",
        "name": "도보여행",
        "description": "골목과 산책길을 천천히 걷는 부산 여행",
        "url": "https://apis.data.go.kr/6260000/WalkingService/getWalkingKr",
        "root": "getWalkingKr",
        "source": "부산도보여행정보 서비스",
    },
)

def _text(value) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _place_key(place: dict) -> str:
    return "".join(character for character in place["name"].casefold() if character.isalnum())


def _category_id(name: str) -> str:
    return f"category:{name}"


def _items(payload: dict, root_name: str) -> list[dict]:
    response = payload.get(root_name, payload.get("response", payload))
    header = response.get("header", {})
    result_code = header.get("resultCode", header.get("code", "00"))
    if str(result_code) != "00":
        raise ValueError(header.get("resultMsg") or header.get("message") or "관광 API가 오류를 반환했습니다.")
    body = response.get("body", response)
    container = body.get("items", body.get("item", []))
    items = container.get("item", []) if isinstance(container, dict) else container
    if isinstance(items, dict):
        return [items]
    return items or []


@lru_cache(maxsize=6)
def _load_source(service_key: str, source_id: str) -> tuple[dict, ...]:
    api = next((item for item in TRAVEL_APIS if item["id"] == source_id), None)
    if not api:
        raise ValueError("지원하지 않는 관광 주제입니다.")
    query = urlencode(
        {"ServiceKey": service_key, "pageNo": 1, "numOfRows": 500, "resultType": "json"},
        safe="%",
    )
    payload = _fetch_json(f"{api['url']}?{query}")
    places = []
    for item in _items(payload, api["root"]):
        lat = _text(item.get("LAT"))
        lng = _text(item.get("LNG"))
        if not lat or not lng:
            continue
        places.append({
            "id": f"{source_id}-{item.get('UC_SEQ') or len(places)}",
            "name": _text(item.get("MAIN_TITLE") or item.get("PLACE")) or "이름 없는 관광지",
            "theme_id": source_id,
            "theme_name": api["name"],
            "category": _text(item.get("CATE2_NM")) or api["name"],
            "district": _text(item.get("GUGUN_NM")) or "부산",
            "address": " ".join(filter(None, [_text(item.get("ADDR1")), _text(item.get("ADDR2"))])),
            "hours": _text(item.get("USAGE_DAY_WEEK_AND_TIME") or item.get("USAGE_DAY")),
            "transport_info": _text(item.get("TRFC_INFO")),
            "contact": _text(item.get("CNTCT_TEL")),
            "homepage": _text(item.get("HOMEPAGE_URL")),
            "description": _text(item.get("ITEMCNTNTS") or item.get("TITLE") or item.get("SUBTITLE")),
            "image": _image_url(_text(item.get("MAIN_IMG_NORMAL") or item.get("MAIN_IMG_THUMB"))),
            "thumbnail": _image_url(_text(item.get("MAIN_IMG_THUMB") or item.get("MAIN_IMG_NORMAL"))),
            "lat": lat,
            "lng": lng,
            "kind": "tourism",
            "stay_minutes": 60,
        })
    return tuple(places)


def travel_themes(service_key: str | None = None) -> dict:
    key = service_key or os.getenv("DATA_GO_KR_SERVICE_KEY")
    if not key:
        raise ValueError("DATA_GO_KR_SERVICE_KEY 환경변수에 공공데이터포털 인증키를 설정해 주세요.")

    loaded = {}
    errors = []
    for api in TRAVEL_APIS:
        try:
            loaded[api["id"]] = list(_load_source(key, api["id"]))
        except ValueError as error:
            loaded[api["id"]] = []
            errors.append({"theme_id": api["id"], "message": str(error)})

    grouped = {"maritime": []}
    theme_names = {"maritime": "해양체험 여행"}
    theme_sources = {"maritime": "부산 해양체험정보 서비스"}
    seen = set()

    # 별도 해양체험 서비스는 하나의 독립 테마로 취급한다.
    for place in loaded["maritime"]:
        place_key = _place_key(place)
        if not place_key or place_key in seen:
            continue
        seen.add(place_key)
        grouped["maritime"].append({**place, "theme_id": "maritime", "theme_name": "해양체험 여행"})

    # API의 CATE2_NM 값을 임의로 합치지 않고 각각 독립 테마로 만든다.
    # 도보 전용 서비스에만 있는 장소도 같은 '도보여행' 분류에 합쳐진다.
    for source_id in ("theme", "walking"):
        for place in loaded[source_id]:
            category = place.get("category") or ("도보여행" if source_id == "walking" else "기타여행")
            theme_id = _category_id(category)
            grouped.setdefault(theme_id, [])
            theme_names[theme_id] = category
            theme_sources[theme_id] = "부산광역시 테마여행정보 서비스" if source_id == "theme" else "부산도보여행정보 서비스"
            place_key = _place_key(place)
            if not place_key or place_key in seen:
                continue
            seen.add(place_key)
            grouped[theme_id].append({**place, "theme_id": theme_id, "theme_name": category})

    themes = []
    ordered_ids = [theme_id for theme_id in grouped if theme_id != "maritime"] + ["maritime"]
    for theme_id in ordered_ids:
        places = sorted(grouped[theme_id], key=lambda place: (place.get("district") or "", place["name"]))
        themes.append({
            "id": theme_id,
            "name": theme_names[theme_id],
            "description": f"공공 API의 '{theme_names[theme_id]}' 분류",
            "source": theme_sources[theme_id],
            "places": places,
            "count": len(places),
        })
    return {
        "themes": themes,
        "total_count": sum(theme["count"] for theme in themes),
        "errors": errors,
        "stay_minutes": 60,
        "return_buffer_minutes": 10,
    }
