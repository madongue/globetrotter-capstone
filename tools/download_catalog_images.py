"""Download reusable catalogue images and attach local paths to JSON data.

The script intentionally works from the image URLs already curated in the
catalogue. It does not scrape social networks or copy protected third-party
gallery images.
"""
from __future__ import annotations

import json
import mimetypes
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATASETS = {
    "places": {
        "json_path": ROOT / "data" / "places.json",
        "asset_dir": ROOT / "client" / "public" / "images" / "places",
        "public_prefix": "/images/places",
    },
    "destinations": {
        "json_path": ROOT / "data" / "destinations.json",
        "asset_dir": ROOT / "client" / "public" / "images" / "destinations",
        "public_prefix": "/images/destinations",
    },
}

IMAGE_REPLACEMENTS = {
    "Douala": {
        "file": "Douala.JPG",
        "source_url": "https://commons.wikimedia.org/wiki/File:Douala.JPG",
    },
    "Yaounde": {
        "file": "Views of Yaounde Cameroon 02.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Views_of_Yaounde_Cameroon_02.jpg",
    },
    "Bafoussam": {
        "file": "Rue Bafoussam (Cameroun).jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Rue_Bafoussam_(Cameroun).jpg",
    },
    "place-yaounde-national-museum": {
        "file": "Musée National du Cameroun 03.JPG",
        "source_url": "https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_National_du_Cameroun_03.JPG",
    },
    "place-yaounde-reunification-monument": {
        "file": "Quartier general.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Quartier_general.jpg",
    },
    "place-foumban-royal-palace": {
        "file": "The Sultans Palace, Foumban.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:The_Sultans_Palace,_Foumban.jpg",
    },
    "place-ebogo-nyong-ecotourism": {
        "file": "Balade sur le Nyong, Ebogo, Cameroun.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Balade_sur_le_Nyong,_Ebogo,_Cameroun.jpg",
    },
    "place-mefou-primate-park": {
        "file": "Chimpanzé.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Chimpanz%C3%A9.jpg",
    },
    "place-bangem-manengouba-twin-lakes": {
        "file": "Manegouba.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Manegouba.jpg",
    },
    "place-douala-marche-fleurs": {
        "file": "Palais des rois Bell - Douala.jpg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Palais_des_rois_Bell_-_Douala.jpg",
        "context_note": "Contextual Douala city image; no reusable exact Marche des Fleurs photo was found.",
    },
}


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "catalog-image"


def _extension(url: str, content_type: str | None) -> str:
    parsed_ext = Path(unquote(urlparse(url).path)).suffix.lower()
    if parsed_ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if parsed_ext == ".jpeg" else parsed_ext

    guessed = mimetypes.guess_extension((content_type or "").split(";")[0].strip())
    if guessed in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if guessed == ".jpeg" else guessed
    return ".jpg"


def _download(url: str) -> tuple[bytes, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "GlobeTrotterCapstone/1.0 (+local educational catalogue)",
        },
    )
    with urlopen(request, timeout=30) as response:
        content_type = response.headers.get("content-type")
        content = response.read()
        if not content:
            raise ValueError("empty response")
        return content, _extension(response.geturl(), content_type)


def _commons_thumb_url(filename: str) -> str:
    query = urlencode(
        {
            "action": "query",
            "titles": f"File:{filename}",
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": "1200",
            "format": "json",
        }
    )
    request = Request(
        f"https://commons.wikimedia.org/w/api.php?{query}",
        headers={"User-Agent": "GlobeTrotterCapstone/1.0 (+local educational catalogue)"},
    )
    with urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        image_info = page.get("imageinfo") or []
        if image_info:
            return image_info[0].get("thumburl") or image_info[0].get("url")
    raise ValueError(f"Commons file not found: {filename}")


def _normalise_image_source(record: dict) -> tuple[str | None, str]:
    replacement = IMAGE_REPLACEMENTS.get(record.get("id")) or IMAGE_REPLACEMENTS.get(record.get("name"))
    if replacement:
        return _commons_thumb_url(replacement["file"]), replacement["source_url"]

    image_url = record.get("original_image_url") or record.get("image_url")
    if not image_url:
        return None, _source_url(record)

    parsed = urlparse(image_url)
    if parsed.netloc == "commons.wikimedia.org" and "/wiki/Special:FilePath/" in parsed.path:
        filename = unquote(parsed.path.rsplit("/", 1)[-1])
        return _commons_thumb_url(filename), _source_url(record)

    return image_url, _source_url(record)


def _attach_local_image(record: dict, local_url: str, source_url: str, original_url: str | None = None) -> None:
    record.setdefault("original_image_url", original_url or source_url)
    record["image_url"] = local_url
    record["local_image_url"] = local_url
    record["image_source_url"] = source_url
    replacement = IMAGE_REPLACEMENTS.get(record.get("id")) or IMAGE_REPLACEMENTS.get(record.get("name")) or {}
    context_note = replacement.get("context_note")
    record["image_license_note"] = (
        "Catalogue image cached locally from the linked source for app display. "
        "Keep the source URL with the record for attribution and licence review."
    )
    if context_note:
        record["image_context_note"] = context_note
    record["images"] = [
        {
            "url": local_url,
            "source_url": record["image_source_url"],
            "license_note": record["image_license_note"],
        }
    ]


def _source_url(record: dict) -> str:
    for source_url in record.get("source_urls", []):
        if "commons.wikimedia.org/wiki/File:" in source_url:
            return source_url
    return record.get("original_image_url") or record.get("image_url", "")


def process_dataset(name: str, config: dict) -> dict:
    json_path = config["json_path"]
    asset_dir = config["asset_dir"]
    public_prefix = config["public_prefix"]
    asset_dir.mkdir(parents=True, exist_ok=True)

    records = json.loads(json_path.read_text(encoding="utf-8"))
    downloaded = 0
    skipped = 0
    failed: list[dict] = []

    for record in records:
        image_url = record.get("image_url")
        if not image_url:
            skipped += 1
            continue
        filename_base = _slug(record.get("id") or record.get("name", name))
        if str(image_url).startswith("/images/"):
            local_path = ROOT / "client" / "public" / image_url.lstrip("/")
            if local_path.exists():
                skipped += 1
                continue
        try:
            download_url, source_url = _normalise_image_source(record)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            failed.append({"id": record.get("id"), "name": record.get("name"), "error": str(exc)})
            continue
        if not download_url:
            skipped += 1
            continue

        expected_targets = list(asset_dir.glob(f"{filename_base}.*"))
        if expected_targets:
            local_url = f"{public_prefix}/{expected_targets[0].name}"
            _attach_local_image(record, local_url, source_url, download_url)
            skipped += 1
            continue

        try:
            content, extension = _download(download_url)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            failed.append({"id": record.get("id"), "name": record.get("name"), "error": str(exc)})
            continue

        filename = f"{filename_base}{extension}"
        target = asset_dir / filename
        target.write_bytes(content)

        local_url = f"{public_prefix}/{filename}"
        _attach_local_image(record, local_url, source_url, download_url)
        downloaded += 1

    json_path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"dataset": name, "downloaded": downloaded, "skipped": skipped, "failed": failed}


def main() -> int:
    names = sys.argv[1:] or list(DATASETS)
    summaries = [process_dataset(name, DATASETS[name]) for name in names if name in DATASETS]
    print(json.dumps(summaries, indent=2))
    return 1 if any(summary["failed"] for summary in summaries) else 0


if __name__ == "__main__":
    raise SystemExit(main())
