from backend.app import travel_content


def test_travel_themes_normalizes_three_public_sources(monkeypatch):
    def fake_fetch(url):
        api = next(item for item in travel_content.TRAVEL_APIS if item["url"] in url)
        return {
            api["root"]: {
                "header": {"code": "00"},
                "item": [{
                    "UC_SEQ": 7,
                    "MAIN_TITLE": f"{api['name']} 장소",
                    "GUGUN_NM": "해운대구",
                    "LAT": 35.1,
                    "LNG": 129.1,
                    "ADDR1": "부산광역시 해운대구",
                    "USAGE_DAY_WEEK_AND_TIME": "09:00~18:00",
                    "TRFC_INFO": "도시철도 이용",
                }],
            }
        }

    travel_content._load_source.cache_clear()
    monkeypatch.setattr(travel_content, "_fetch_json", fake_fetch)
    result = travel_content.travel_themes("test-key")

    assert result["total_count"] == 3
    assert [theme["id"] for theme in result["themes"]] == ["category:부산 테마여행", "category:도보여행", "maritime"]
    maritime = next(theme for theme in result["themes"] if theme["id"] == "maritime")
    assert maritime["places"][0]["transport_info"] == "도시철도 이용"
    assert maritime["places"][0]["stay_minutes"] == 60
    travel_content._load_source.cache_clear()


def test_travel_themes_keeps_other_sources_when_one_fails(monkeypatch):
    def fake_load(key, source_id):
        if source_id == "theme":
            raise ValueError("승인 대기")
        return ({"id": source_id, "name": f"{source_id} 장소", "category": source_id},)

    monkeypatch.setattr(travel_content, "_load_source", fake_load)
    result = travel_content.travel_themes("test-key")

    assert result["total_count"] == 2
    assert result["errors"] == [{"theme_id": "theme", "message": "승인 대기"}]
