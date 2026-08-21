"""Find and cache freely-licensed media from Wikimedia Commons.

Used to give curated tourist sites real photography (and video where it
exists) without depending on an API key or scraping anyone's gallery. Commons
media is licensed for reuse, and every file cached here keeps its source URL,
licence and author so the app can attribute it properly.

    python tools/fetch_commons_media.py --search "Lobe Falls Cameroon" --slug place-kribi-lobe-falls
    python tools/fetch_commons_media.py --probe "Rhumsiki Cameroon"

Only used at build time by the curation script; the app never calls Commons at
runtime.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, unquote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PLACES_DIR = ROOT / "client" / "public" / "images" / "places"

API = "https://commons.wikimedia.org/w/api.php"
UA = "GlobeTrotterCapstone/1.0 (+educational Cameroon travel catalogue)"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXT = {".webm", ".ogv", ".mp4"}

#: Commons hosts plenty of maps, coats of arms and diagrams that match a place
#: name but are useless as travel photography.
REJECT = re.compile(
    r"(map|carte|flag|coat[_ ]of[_ ]arms|logo|locator|diagram|chart|seal|"
    r"blason|icon|svg|plan\b|graph)",
    re.I,
)


def _get(params: dict, retries: int = 3):
    url = f"{API}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": UA})
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code == 429 and attempt < retries - 1:
                # Commons throttles hard and asks for a slower approach; back
                # off progressively rather than hammering it.
                time.sleep(30 * (attempt + 1))
                continue
            raise
        except (URLError, TimeoutError):
            if attempt < retries - 1:
                time.sleep(5)
                continue
            raise
    return {}


def search(term: str, limit: int = 12, want: str = "image") -> list[dict]:
    """Return candidate Commons files for *term*, best first."""
    wanted_ext = VIDEO_EXT if want == "video" else IMAGE_EXT
    payload = _get(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{term} filetype:{'video' if want == 'video' else 'bitmap'}",
            "gsrnamespace": "6",
            "gsrlimit": str(limit),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
            "iiurlwidth": "1280",
            "format": "json",
        }
    )

    pages = (payload.get("query") or {}).get("pages") or {}
    results = []
    for page in pages.values():
        title = page.get("title", "")
        if REJECT.search(title):
            continue
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("url") or ""
        suffix = Path(unquote(urlparse(url).path)).suffix.lower()
        if suffix not in wanted_ext:
            continue

        meta = info.get("extmetadata") or {}

        def field(key: str) -> str:
            raw = (meta.get(key) or {}).get("value", "") or ""
            return re.sub(r"<[^>]+>", "", str(raw)).strip()

        results.append(
            {
                "title": title,
                "download_url": info.get("thumburl") or url,
                "full_url": url,
                "page_url": f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
                "license": field("LicenseShortName"),
                "author": field("Artist"),
                "description": field("ImageDescription")[:300],
                "width": info.get("width", 0),
                "height": info.get("height", 0),
                "index": page.get("index", 999),
            }
        )

    results.sort(key=lambda item: item["index"])
    return results


def download(url: str, slug: str, directory: Path = PLACES_DIR) -> str:
    """Cache *url* under *slug*, returning the public path."""
    directory.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=60) as response:
                content = response.read()
                content_type = response.headers.get("content-type", "")
            break
        except HTTPError as exc:
            if exc.code == 429 and attempt < 2:
                time.sleep(30 * (attempt + 1))
                continue
            raise
    else:  # pragma: no cover - loop always breaks or raises
        raise RuntimeError("download failed")

    suffix = Path(unquote(urlparse(url).path)).suffix.lower()
    if suffix not in IMAGE_EXT | VIDEO_EXT:
        suffix = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ".jpg"
    if suffix == ".jpeg":
        suffix = ".jpg"

    target = directory / f"{slug}{suffix}"
    target.write_bytes(content)
    return f"/images/places/{target.name}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--search", help="term to search and download")
    parser.add_argument("--probe", help="search and print candidates without downloading")
    parser.add_argument("--slug", help="filename stem for the cached file")
    parser.add_argument("--want", choices=("image", "video"), default="image")
    args = parser.parse_args()

    term = args.search or args.probe
    if not term:
        parser.error("pass --search or --probe")

    results = search(term, want=args.want)
    if not results:
        print(f"no {args.want} results for {term!r}")
        return 1

    for item in results[:6]:
        print(f"  {item['title']}")
        print(f"    {item['width']}x{item['height']}  {item['license']}  {item['author'][:50]}")

    if args.probe:
        return 0

    if not args.slug:
        parser.error("--search requires --slug")

    best = results[0]
    path = download(best["download_url"], args.slug)
    print(f"\nsaved {path} from {best['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
