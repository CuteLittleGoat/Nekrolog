import json
import math
import os
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dateutil.parser import parse as dtparse

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Kapelanka-Monitor/1.0)"}
TIMEOUT = 30
KAPELANKA_COORDS = (50.03528, 19.92487)
MAX_DISTANCE_KM = 5.0

TARGET_PHRASES = [
    "Helena Gawin",
    "Helena Dereń",
    "Helena Dereń-Gawin",
    "Helena Dereń Gawin",
    "Helena Gawin-Dereń",
    "Helena Gawin Dereń",
]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def norm_loose(text: str) -> str:
    value = unicodedata.normalize("NFKD", (text or "").strip().lower())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[\-_]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def safe_date(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    try:
        return dtparse(value, dayfirst=True).date().isoformat()
    except Exception:
        return None


def extract_name(value: str) -> Optional[str]:
    cleaned = re.sub(r"\s+", " ", (value or "")).strip(" -:;,|")
    cleaned = re.sub(r"\bśp\.?\s*", "", cleaned, flags=re.I).strip()
    if not cleaned:
        return None

    match = re.search(
        r"([A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\-.']+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\-.']+)+)",
        cleaned,
    )
    return match.group(1).strip() if match else None


def should_keep_by_date(row: "Row", cutoff: date) -> bool:
    candidate = row.date_funeral if row.kind == "funeral" else row.date_death
    parsed = safe_date(candidate or "")
    if not parsed:
        return False
    return parsed >= cutoff.isoformat()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return r * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


@dataclass
class Row:
    kind: str
    name: str
    date_death: Optional[str] = None
    date_funeral: Optional[str] = None
    time_funeral: Optional[str] = None
    place: Optional[str] = None
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    url: Optional[str] = None
    note: Optional[str] = None
    priority_hit: bool = False


def fetch_html(url: str) -> BeautifulSoup:
    response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    response.raise_for_status()
    return BeautifulSoup(response.text, "lxml")


def parse_zck_funerals(source: Dict[str, Any]) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    funerals: List[Row] = []
    current_cemetery = None

    for tag in soup.find_all(["h4", "h3", "p", "div", "li"]):
        text = tag.get_text(" ", strip=True)
        if not text:
            continue
        if text.lower().startswith("cmentarz"):
            current_cemetery = text
            continue

        match = re.match(r"^(\d{1,2}:\d{2})\s+(.+?)\s+([A-ZĄĆĘŁŃÓŚŹŻ].+?)\s*\(lat\s*(\d+)\)", text)
        if match and current_cemetery:
            funerals.append(
                Row(
                    kind="funeral",
                    name=match.group(3).strip(),
                    time_funeral=match.group(1),
                    place=f"{current_cemetery} — {match.group(2).strip()}",
                    source_id=source["id"],
                    source_name=source["name"],
                    url=source["url"],
                    note=f"wiek: {match.group(4)}",
                )
            )

    return [], funerals


def parse_podwawelskie_nekrologi(source: Dict[str, Any]) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    lines = [ln.strip() for ln in soup.get_text("\n", strip=True).splitlines() if ln.strip()]
    deaths: List[Row] = []

    for index in range(len(lines) - 3):
        if re.match(r"^\d{4}-\d{2}-\d{2}$", lines[index + 2]) and re.match(r"^\d{4}-\d{2}-\d{2}$", lines[index + 3]):
            deaths.append(
                Row(
                    kind="death",
                    name=f"{lines[index]} {lines[index + 1]}".strip(),
                    date_death=safe_date(lines[index + 3]) or lines[index + 3],
                    place="Parafia MB Fatimskiej — Nekrologi",
                    source_id=source["id"],
                    source_name=source["name"],
                    url=source["url"],
                    note=f"ur.: {lines[index + 2]}",
                )
            )

    dedup = {(norm(r.name), r.date_death): r for r in deaths}
    return list(dedup.values()), []


def parse_podwawelskie_ogloszenia(source: Dict[str, Any]) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    text = soup.get_text(" ", strip=True)
    deaths: List[Row] = []
    block = re.search(r"W minionym tygodniu pożegnaliśmy:(.+?)(Dobry Jezu|Pomódlmy|$)", text, flags=re.I)
    if block:
        for fragment in re.split(r"[,+]\s*\+?\s*", block.group(1)):
            candidate = fragment.strip(" .;:-")
            if re.search(r"[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+", candidate):
                deaths.append(
                    Row(
                        kind="death",
                        name=candidate,
                        place="Parafia MB Fatimskiej — ogłoszenia",
                        source_id=source["id"],
                        source_name=source["name"],
                        url=source["url"],
                    )
                )
    return deaths, []


def parse_intencje(source: Dict[str, Any], place_name: str) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    deaths: List[Row] = []
    for node in soup.find_all(["p", "li", "div"]):
        text = node.get_text(" ", strip=True)
        if "+" not in text and "†" not in text:
            continue
        for match in re.finditer(r"(\+|†)\s*([A-ZĄĆĘŁŃÓŚŹŻ][^•]{3,80})", text):
            tail = re.sub(r"\s+", " ", match.group(2)).strip(" .;:")
            if re.search(r"za zmar|za paraf", tail, flags=re.I):
                continue
            deaths.append(
                Row(
                    kind="death",
                    name=tail,
                    place=place_name,
                    source_id=source["id"],
                    source_name=source["name"],
                    url=source["url"],
                    note="Wpis z intencji mszalnych (potencjalna wskazówka).",
                )
            )
    dedup = {(norm(r.name), r.source_id): r for r in deaths}
    return list(dedup.values()), []


def parse_grobonet(source: Dict[str, Any]) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    deaths: List[Row] = []
    for row in soup.find_all("tr"):
        cols = [td.get_text(" ", strip=True) for td in row.find_all(["td", "th"])]
        if not cols:
            continue
        text = " | ".join(cols)
        m_name = re.search(r"([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)", text)
        m_date = re.search(r"(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})", text)
        if m_name and m_date:
            deaths.append(
                Row(
                    kind="death",
                    name=m_name.group(1),
                    date_death=safe_date(m_date.group(1)),
                    place="Cmentarz Salwatorski (Grobonet)",
                    source_id=source["id"],
                    source_name=source["name"],
                    url=source["url"],
                )
            )
    dedup = {(norm(r.name), r.date_death): r for r in deaths}
    return list(dedup.values()), []


def parse_funeral_home(source: Dict[str, Any]) -> Tuple[List[Row], List[Row]]:
    soup = fetch_html(source["url"])
    deaths: List[Row] = []
    funerals: List[Row] = []
    checked = 0
    seen_urls = set()

    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        text = link.get_text(" ", strip=True)
        if not text or ("nekrolog" not in href.lower() and "nekrolog" not in text.lower()):
            continue

        url = urljoin(source["url"], href)
        if "/nekrolog/" not in url.lower() or url in seen_urls:
            continue
        seen_urls.add(url)

        if checked >= 15:
            break
        checked += 1

        try:
            detail = fetch_html(url).get_text(" ", strip=True)
        except Exception:
            continue

        m_name_detail = re.search(r"Śp\.?\s+([^\d|]+)", detail, flags=re.I)
        name = extract_name(text) or (extract_name(m_name_detail.group(1)) if m_name_detail else None)
        if not name:
            continue

        d_match = re.search(
            r"(?:\bzm\.|data\s+zgonu)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})",
            detail,
            flags=re.I,
        )
        if not d_match:
            range_match = re.search(
                r"\b(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})\b",
                detail,
            )
            if range_match:
                d_match = range_match

        f_match = re.search(
            r"(?:data\s+pogrzebu|pogrzeb(?:\s+(?:dziś|dzisiaj|jutro))?)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})",
            detail,
            flags=re.I,
        )
        if not f_match:
            fallback_funeral = re.search(
                r"pogrzeb\s+odbędzie\s+się\s*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})",
                detail,
                flags=re.I,
            )
            if fallback_funeral:
                f_match = fallback_funeral

        t_match = re.search(r"(?:godz\.|godzina|o\s+godz\.)\s*[:\-]?\s*([0-2]?\d[:.][0-5]\d)", detail, flags=re.I)
        if d_match:
            deaths.append(
                Row(
                    kind="death",
                    name=name,
                    date_death=safe_date(d_match.group(1) if d_match.lastindex == 1 else d_match.group(2))
                    or (d_match.group(1) if d_match.lastindex == 1 else d_match.group(2)),
                    place="Dom pogrzebowy — nekrolog",
                    source_id=source["id"],
                    source_name=source["name"],
                    url=url,
                )
            )
        if f_match or t_match:
            funerals.append(
                Row(
                    kind="funeral",
                    name=name,
                    date_funeral=safe_date(f_match.group(1)) if f_match else None,
                    time_funeral=t_match.group(1).replace(".", ":") if t_match else None,
                    place="Dom pogrzebowy — szczegóły pogrzebu",
                    source_id=source["id"],
                    source_name=source["name"],
                    url=url,
                )
            )

    dedup_deaths = {(norm(r.name), r.date_death, r.source_id): r for r in deaths}
    dedup_funerals = {(norm(r.name), r.date_funeral, r.time_funeral, r.source_id): r for r in funerals}
    return list(dedup_deaths.values()), list(dedup_funerals.values())


PARSERS = {
    "zck_funerals": parse_zck_funerals,
    "table_nekrologi_podwawelskie": parse_podwawelskie_nekrologi,
    "podwawelskie_ogloszenia": parse_podwawelskie_ogloszenia,
    "intencje_simple": lambda s: parse_intencje(s, "Parafia Ruczaj — intencje (+/†)"),
    "intencje_debniki": lambda s: parse_intencje(s, "Dębniki — intencje (+/†)"),
    "intencje_pychowice": lambda s: parse_intencje(s, "Pychowice — intencje (+/†)"),
    "grobonet_nekrologi": parse_grobonet,
    "funeral_home_nekrologi_generic": parse_funeral_home,
}


def add_priority_hit(rows: List[Row]) -> None:
    phrases = [norm_loose(p) for p in TARGET_PHRASES]
    for row in rows:
        hay = norm_loose(f"{row.name} {row.note or ''} {row.place or ''}")
        row.priority_hit = any(p in hay for p in phrases)


def filter_recent_rows(deaths: List[Row], funerals: List[Row]) -> Tuple[List[Row], List[Row]]:
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=7)

    filtered_deaths = [row for row in deaths if row.priority_hit or should_keep_by_date(row, cutoff)]
    filtered_funerals = [row for row in funerals if row.priority_hit or should_keep_by_date(row, cutoff)]
    return filtered_deaths, filtered_funerals


def run(out_path: str = "data/latest.json", sources_path: str = "sources.json") -> int:
    with open(sources_path, "r", encoding="utf-8") as file:
        config = json.load(file)

    filtered_sources = []
    for src in config["sources"]:
        lat, lon = src["coords"]["lat"], src["coords"]["lon"]
        distance = haversine_km(KAPELANKA_COORDS[0], KAPELANKA_COORDS[1], lat, lon)
        if distance <= MAX_DISTANCE_KM:
            src = dict(src)
            src["distance_km"] = round(distance, 3)
            filtered_sources.append(src)

    all_deaths: List[Row] = []
    all_funerals: List[Row] = []

    for src in filtered_sources:
        parser = PARSERS.get(src["type"])
        if not parser:
            print(f"[WARN] Brak parsera: {src['type']}", file=sys.stderr)
            continue
        try:
            deaths, funerals = parser(src)
            all_deaths.extend(deaths)
            all_funerals.extend(funerals)
            print(f"[OK] {src['id']} deaths={len(deaths)} funerals={len(funerals)}")
        except Exception as exc:
            print(f"[ERR] {src['id']}: {exc}", file=sys.stderr)

    add_priority_hit(all_deaths)
    add_priority_hit(all_funerals)

    all_deaths, all_funerals = filter_recent_rows(all_deaths, all_funerals)

    all_deaths.sort(key=lambda r: r.date_death or "0000-00-00", reverse=True)
    all_funerals.sort(key=lambda r: ((r.date_funeral or "9999-99-99"), (r.time_funeral or "99:99")))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_center": {"label": "ul. Kapelanka, Kraków", "lat": KAPELANKA_COORDS[0], "lon": KAPELANKA_COORDS[1]},
        "sources": [
            {
                "id": src["id"],
                "name": src["name"],
                "url": src["url"],
                "type": src["type"],
                "distance_km": src["distance_km"],
            }
            for src in sorted(filtered_sources, key=lambda item: item["distance_km"])
        ],
        "recent_deaths": [asdict(r) for r in all_deaths[:250]],
        "upcoming_funerals": [asdict(r) for r in all_funerals[:250]],
        "target_phrases": TARGET_PHRASES,
    }

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)

    hits = [r for r in all_deaths + all_funerals if r.priority_hit]
    print(f"[INFO] priority hits: {len(hits)}")
    print(f"[INFO] sources within {MAX_DISTANCE_KM} km: {len(filtered_sources)}")
    return 0


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "data/latest.json"
    raise SystemExit(run(out_path=output))
