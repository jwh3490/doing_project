from backend.app import festival


def test_festival_calendar_normalizes_api_items(monkeypatch):
    monkeypatch.setattr(
        festival,
        "_fetch_json",
        lambda _url: {
            "response": {
                "header": {"resultCode": "00", "resultMsg": "OK"},
                "body": {
                    "totalCount": 1,
                    "items": {
                        "item": {
                            "UC_SEQ": 71,
                            "MAIN_TITLE": "부산바다축제",
                            "GUGUN_NM": "수영구",
                            "USAGE_DAY": "2026. 8. 1. ~ 2026. 8. 3.",
                            "MAIN_IMG_NORMAL": "/images/festival.jpg",
                        }
                    },
                },
            }
        },
    )

    result = festival.festival_calendar("test-key")

    assert result["events"][0]["start_date"] == "2026-08-01"
    assert result["events"][0]["end_date"] == "2026-08-03"
    assert result["events"][0]["image"].startswith("https://www.visitbusan.net/")


def test_festival_calendar_requires_service_key(monkeypatch):
    monkeypatch.delenv("DATA_GO_KR_SERVICE_KEY", raising=False)

    try:
        festival.festival_calendar()
    except ValueError as error:
        assert "DATA_GO_KR_SERVICE_KEY" in str(error)
    else:
        raise AssertionError("missing service key should fail")


def test_festival_calendar_supports_flat_busan_response(monkeypatch):
    monkeypatch.setattr(
        festival,
        "_fetch_json",
        lambda _url: {
            "getFestivalKr": {
                "header": {"resultCode": "00"},
                "item": [{
                    "UC_SEQ": "1",
                    "MAIN_TITLE": "부산 축제",
                    "USAGE_DAY": "",
                    "USAGE_DAY_WEEK_AND_TIME": "2025. 8. 1. ~ 8. 3.",
                }],
                "totalCount": 1,
            }
        },
    )

    result = festival.festival_calendar("test-key")

    assert result["events"][0]["start_date"] == "2025-08-01"
    assert result["events"][0]["end_date"] == "2025-08-03"
