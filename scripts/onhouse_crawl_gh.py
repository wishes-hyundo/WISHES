#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# [L-sec148 2026-04-23] 아래 ADMIN_TOKEN="wishes2026" 은 L-sec3/sec89 에서
#   서버측 fallback 이 제거된 이후 인증 실패 상태. 크롤러를 다시 사용하려면
#   아래 중 하나로 교체:
#     1) WISHES_ADMIN_MASTER_PASSWORD env 값 (운영 마스터 키)
#     2) WISHES_CRAWLER_BRIDGE_TOKEN env 값 (크롤러 전용 브리지, 권장)
#   교체 후에도 "wishes2026" 문자열은 저장소 이력에 남아 있으므로 운영 시
#   동일 문자열을 재사용하지 말 것.
import json, time, re, os, urllib.request, urllib.parse, urllib.error, http.cookiejar

ADMIN_API   = "https://wishes.co.kr/api/admin/listings"
ADMIN_TOKEN = os.environ.get("WISHES_CRAWLER_BRIDGE_TOKEN") \
              or os.environ.get("WISHES_ADMIN_MASTER_PASSWORD") \
              or ""
ONHOUSE     = "https://www.onhouse.co.kr"
LAT_MIN, LAT_MAX = 37.38, 37.72
LNG_MIN, LNG_MAX = 126.75, 127.25
N = 20

KNOWN = {"3491948","3491949","3491950","3491960","3491961","3491963","3491964","3491965","3491976","3491978"}

TYPE_MAP = {
    "원룸":"원룸","투룸":"투룸","쓰리룸":"쓰리룸","쓰리룸+":"쓰리룸",
    "오피스텔":"오피스텔","아파트":"아파트","빌라":"빌라","연립":"빌라",
    "상가":"상가","사무실":"사무실","공장":"공장/창고","창고":"공장/창고",
    "지식산업센터":"지식산업센터",
}

def login():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")]
    for _ in range(3):
        try:
            d = urllib.parse.urlencode({"id":"wishes","pw":"1212","auto_login":"N"}).encode()
            r = op.open(f"{ONHOUSE}/index.php/dataFunction/login", d, timeout=15)
            res = json.loads(r.read().decode("utf-8","replace"))
            if res.get("result") == "success":
                print("Login OK"); return op
            d2 = urllib.parse.urlencode({"sns_id":"175150","sns_type":"kakao","email":"","name":"wishes"}).encode()
            op.open(f"{ONHOUSE}/index.php/dataFunction/kakao_create", d2, timeout=15)
            d3 = urllib.parse.urlencode({"id":"wishes","pw":"1212"}).encode()
            op.open(f"{ONHOUSE}/index.php/dataFunction/toLoginNormal", d3, timeout=15)
            print("Login OK (kakao)"); return op
        except Exception as e:
            print(f"Login err: {e}"); time.sleep(2)
    return op

def collect_ids(op):
    ids = set()
    lat_s = (LAT_MAX - LAT_MIN) / N
    lng_s = (LNG_MAX - LNG_MIN) / N
    url = f"{ONHOUSE}/index.php/dataFunction/rentMapList"
    for i in range(N):
        for j in range(N):
            p = {
                "sLat": f"{LAT_MIN+i*lat_s:.6f}", "eLat": f"{LAT_MIN+(i+1)*lat_s:.6f}",
                "sLng": f"{LNG_MIN+j*lng_s:.6f}", "eLng": f"{LNG_MIN+(j+1)*lng_s:.6f}",
                "roomTypeList": '["6","7","8","9","10","11"]',
                "page": "1", "listNum": "20",
            }
            data = urllib.parse.urlencode(p).encode()
            for _ in range(3):
                try:
                    req = urllib.request.Request(url, data=data, headers={
                        "User-Agent": "Mozilla/5.0",
                        "Content-Type": "application/x-www-form-urlencoded"
                    })
                    r = op.open(req, timeout=15)
                    res = json.loads(r.read().decode("utf-8","replace"))
                    for item in res.get("list", res.get("data", [])):
                        lid = str(item.get("listing_id") or item.get("id") or item.get("seq",""))
                        if lid: ids.add(lid)
                    break
                except: time.sleep(0.5)
            time.sleep(0.12)
        done = (i + 1) * N
        if done % 100 == 0:
            print(f"Grid {done}/{N*N}, IDs: {len(ids)}", flush=True)
    print(f"Total IDs collected: {len(ids)}")
    return list(ids)

def srch(pat, html):
    m = re.search(pat, html, re.DOTALL)
    return m.group(1).strip() if m else None

def parse(op, lid):
    url = f"{ONHOUSE}/index.php/main/detailView/{lid}"
    html = ""
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            r = op.open(req, timeout=20)
            html = r.read().decode("utf-8", "replace")
            break
        except: time.sleep(1)
    if not html:
        return None

    d = {"source_id": str(lid), "source_site": "onhouse", "source_url": url}

    title = srch(r'<h1[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)</h1>', html)
    if title: title = re.sub(r"<[^>]+>", "", title).strip()
    d["title"] = title or srch(r'"title"\s*:\s*"([^"]+)"', html) or f"온하우스 {lid}"
    d["address"] = srch(r'"address"\s*:\s*"([^"]+)"', html) or srch(r'"jibunAddr"\s*:\s*"([^"]+)"', html) or ""
    raw_type = srch(r'"roomType"\s*:\s*"([^"]+)"', html) or "상가"
    d["type"] = TYPE_MAP.get(raw_type.strip(), "상가")

    dep = int(srch(r'"deposit"\s*:\s*(\d+)', html) or 0) * 10000
    mon = int(srch(r'"monthly"\s*:\s*(\d+)', html) or 0) * 10000
    sale_v = int(srch(r'"salePrice"\s*:\s*(\d+)', html) or 0) * 10000
    rent_raw = srch(r'"dealType"\s*:\s*"([^"]+)"', html) or ""
    tx = "전세" if "전세" in rent_raw else ("매매" if "매매" in rent_raw else "월세")
    d["deal"] = tx
    d["deposit"] = dep
    d["monthly"] = mon if tx != "매매" else 0
    d["price"] = sale_v if tx == "매매" else None

    area = srch(r'"exclusiveArea"\s*:\s*"?([\d.]+)"?', html)
    d["area_m2"] = float(area) if area else 0.0
    floor = srch(r'"floor"\s*:\s*"?(\d+)"?', html)
    d["floor_current"] = int(floor) if floor else None
    mf = srch(r'"manageFee"\s*:\s*"?(\d+)"?', html)
    d["maintenance_fee"] = int(mf) * 10000 if mf else 0
    d["maintenance_includes"] = []
    d["building_name"] = srch(r'"buildingName"\s*:\s*"([^"]+)"', html)
    d["previous_business"] = None
    d["recommended_business"] = None
    d["restricted_business"] = None
    park = srch(r'"parkingNum"\s*:\s*"?(\d+)"?', html)
    d["parking_spaces"] = int(park) if park else None
    d["contact"] = srch(r'"phone"\s*:\s*"([^"]+)"', html) or srch(r'"tel"\s*:\s*"([^"]+)"', html)
    lat = srch(r'"lat(?:itude)?"\s*:\s*"?(3[67]\.\d+)"?', html)
    lng = srch(r'"ln?g(?:itude)?"\s*:\s*"?(12[67]\.\d+)"?', html)
    d["latitude"] = float(lat) if lat else None
    d["longitude"] = float(lng) if lng else None
    # DB 컬럼명으로 매핑 (lat/lng)
    if d["latitude"]: d["lat"] = d["latitude"]
    if d["longitude"]: d["lng"] = d["longitude"]

    img_pat = re.compile(r"https?://\S+onhouse\S+\.(?:jpg|jpeg|png|webp)", re.IGNORECASE)
    imgs = list(dict.fromkeys(img_pat.findall(html)))[:10]
    d["images"] = imgs

    year = srch(r'"builtYear"\s*:\s*"?(\d{4})"?', html)
    d["built_year"] = str(year) if year else None
    d["description"] = ""
    return d

def upload(listing):
    payload = json.dumps(listing, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(ADMIN_API, data=payload,
        headers={"Content-Type": "application/json;charset=utf-8",
                 "Authorization": f"Bearer {ADMIN_TOKEN}"},
        method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode(errors="replace")[:200]}
    except Exception as e:
        return {"error": str(e)}

def main():
    print("=== Onhouse Crawl Start ===", flush=True)
    op = login()
    all_ids = collect_ids(op)
    new_ids = [x for x in all_ids if x not in KNOWN]
    print(f"New IDs to crawl: {len(new_ids)}", flush=True)
    uploaded = failed = 0
    for i, lid in enumerate(new_ids):
        detail = parse(op, lid)
        if not detail:
            print(f"[{i+1}/{len(new_ids)}] {lid} FAIL parse", flush=True)
            failed += 1; time.sleep(0.5); continue
        result = upload(detail)
        if "error" in result:
            print(f"[{i+1}/{len(new_ids)}] {lid} FAIL upload: {result['error']}", flush=True)
            failed += 1
        else:
            print(f"[{i+1}/{len(new_ids)}] {lid} OK id={result.get('id','?')}", flush=True)
            uploaded += 1
        if (i + 1) % 50 == 0:
            op = login()
        time.sleep(0.4)
    print(f"=== Done: {uploaded} uploaded, {failed} failed ===", flush=True)

if __name__ == "__main__":
    main()
