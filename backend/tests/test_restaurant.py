from backend.app import restaurant


def test_restaurant_directory_filters_and_paginates(monkeypatch):
    monkeypatch.setattr(
        restaurant,
        "_load_restaurants",
        lambda _key: (
            {"name": "해운대 국밥", "district": "해운대구", "address": "해운대", "menu": "국밥"},
            {"name": "강서 밀면", "district": "강서구", "address": "강서구", "menu": "밀면"},
        ),
    )

    result = restaurant.restaurant_directory("key", query="밀면", district="강서구", page_size=1)

    assert result["total_count"] == 1
    assert result["restaurants"][0]["name"] == "강서 밀면"
    assert result["districts"] == ["강서구", "해운대구"]


def test_restaurant_directory_requires_service_key(monkeypatch):
    monkeypatch.delenv("DATA_GO_KR_SERVICE_KEY", raising=False)
    try:
        restaurant.restaurant_directory()
    except ValueError as error:
        assert "DATA_GO_KR_SERVICE_KEY" in str(error)
    else:
        raise AssertionError("missing service key should fail")


def test_load_restaurants_accepts_live_api_shape(monkeypatch):
    restaurant._load_restaurants.cache_clear()
    monkeypatch.setattr(
        restaurant,
        "_fetch_json",
        lambda _url: {
            "getFoodKr": {
                "header": {"code": "00", "message": "NORMAL_CODE"},
                "item": [{
                    "UC_SEQ": 70,
                    "MAIN_TITLE": "부산 맛집",
                    "GUGUN_NM": "중구",
                    "LAT": 35.1,
                    "LNG": 129.0,
                }],
            }
        },
    )

    result = restaurant._load_restaurants("live-shape-key")

    assert len(result) == 1
    assert result[0]["name"] == "부산 맛집"
    assert result[0]["lat"] == "35.1"
    restaurant._load_restaurants.cache_clear()
