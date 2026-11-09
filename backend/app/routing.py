import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _request_json(url: str, key: str) -> dict:
    request = Request(url, headers={"Authorization": f"KakaoAK {key}", "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:  # noqa: S310 - fixed Kakao hosts
            return json.load(response)
    except HTTPError as error:
        try:
            detail = json.loads(error.read().decode("utf-8")).get("msg")
        except (ValueError, UnicodeDecodeError):
            detail = None
        raise ValueError(detail or f"카카오 경로 API가 HTTP {error.code} 오류를 반환했습니다.") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError("카카오 경로 API에 연결하지 못했습니다.") from error


def _car_route(key: str, start: tuple[float, float], stop: tuple[float, float]) -> dict:
    query = urlencode({
        "origin": f"{start[0]},{start[1]}",
        "destination": f"{start[0]},{start[1]}",
        "waypoints": f"{stop[0]},{stop[1]}",
        "priority": "RECOMMEND",
        "summary": "false",
    })
    payload = _request_json(f"https://apis-navi.kakaomobility.com/v1/directions?{query}", key)
    route = (payload.get("routes") or [{}])[0]
    if route.get("result_code") not in (0, None):
        raise ValueError(route.get("result_msg") or "자동차 경로를 찾지 못했습니다.")
    points = []
    for section in route.get("sections", []):
        for road in section.get("roads", []):
            vertexes = road.get("vertexes", [])
            points.extend([[vertexes[index + 1], vertexes[index]] for index in range(0, len(vertexes) - 1, 2)])
    summary = route.get("summary", {})
    return {"path": points, "duration_seconds": summary.get("duration"), "distance_meters": summary.get("distance")}


def _map_route(key: str, mode: str, start: tuple[float, float], stop: tuple[float, float]) -> dict:
    endpoint = {"walk": "walk", "bicycle": "bicycle"}[mode]
    query = urlencode({
        "start_x": start[0], "start_y": start[1],
        "via_x": stop[0], "via_y": stop[1],
        "end_x": start[0], "end_y": start[1],
        "input_coord": "WGS84", "output_coord": "WGS84",
    })
    payload = _request_json(f"https://dapi.kakao.com/v2/routing/{endpoint}?{query}", key)
    if payload.get("status") != "OK":
        raise ValueError("카카오맵에서 조건에 맞는 경로를 찾지 못했습니다.")
    route = payload.get("route", {})
    points = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            points.extend([[point[1], point[0]] for point in step.get("path", {}).get("points", [])])
    properties = route.get("properties", {})
    return {"path": points, "duration_seconds": properties.get("totalTime"), "distance_meters": properties.get("totalDistance")}


def _traffic_leg(key: str, start: tuple[float, float], end: tuple[float, float]) -> dict:
    query = urlencode({
        "start_x": start[0], "start_y": start[1],
        "end_x": end[0], "end_y": end[1],
        "input_coord": "WGS84", "output_coord": "WGS84",
    })
    payload = _request_json(f"https://dapi.kakao.com/v2/routing/publictraffic?{query}", key)
    if payload.get("status") != "OK" or not payload.get("routes"):
        raise ValueError("카카오맵에서 대중교통 경로를 찾지 못했습니다.")
    route = payload["routes"][0]
    points = []
    for step in route.get("steps", []):
        points.extend([[point[1], point[0]] for point in step.get("path", {}).get("points", [])])
    properties = route.get("properties", {})
    return {"path": points, "duration_seconds": properties.get("totalTime", 0), "distance_meters": properties.get("totalDistance", 0)}


def kakao_round_trip(mode: str, start_lng: float, start_lat: float, stop_lng: float, stop_lat: float) -> dict:
    key = os.getenv("KAKAO_REST_API_KEY")
    if not key:
        raise ValueError("KAKAO_REST_API_KEY 환경변수에 카카오 REST API 키를 설정해 주세요.")
    start = (start_lng, start_lat)
    stop = (stop_lng, stop_lat)
    if mode == "car":
        result = _car_route(key, start, stop)
    elif mode in {"walk", "bicycle"}:
        result = _map_route(key, mode, start, stop)
    elif mode == "traffic":
        outbound = _traffic_leg(key, start, stop)
        inbound = _traffic_leg(key, stop, start)
        result = {
            "path": outbound["path"] + inbound["path"],
            "duration_seconds": outbound["duration_seconds"] + inbound["duration_seconds"],
            "distance_meters": outbound["distance_meters"] + inbound["distance_meters"],
        }
    else:
        raise ValueError("지원하지 않는 이동수단입니다.")
    if not result["path"]:
        raise ValueError("카카오 경로 좌표가 비어 있습니다.")
    return {**result, "mode": mode, "source": "Kakao route API"}
