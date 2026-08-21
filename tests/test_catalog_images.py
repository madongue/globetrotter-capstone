import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read_catalog(name: str) -> list[dict]:
    return json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))


def test_place_catalog_images_are_local_assets():
    """Places that ship an image must reference a local, attributed asset.

    The bulk OpenStreetMap import adds most places without imagery, and the UI
    renders those without a thumbnail, so an absent image_url is valid. What
    must not happen is a place pointing at a remote or missing file.
    """
    for place in _read_catalog("places"):
        image_url = place.get("image_url", "")
        if not image_url:
            continue

        assert image_url.startswith("/images/places/"), place["name"]
        assert (ROOT / "client" / "public" / image_url.lstrip("/")).exists(), place["name"]
        assert place.get("image_source_url"), place["name"]


def test_destination_catalog_images_are_local_assets():
    for destination in _read_catalog("destinations"):
        image_url = destination.get("image_url", "")

        assert image_url.startswith("/images/destinations/"), destination["name"]
        assert (ROOT / "client" / "public" / image_url.lstrip("/")).exists(), destination["name"]
        assert destination.get("image_source_url"), destination["name"]
