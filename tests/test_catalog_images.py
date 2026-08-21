import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read_catalog(name: str) -> list[dict]:
    return json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))


def test_place_catalog_images_are_local_assets():
    """Places that ship an image must reference a local, attributed asset.

    A place image is either a photograph of the place itself, under
    /images/places/, or a contextual photograph of its city borrowed from the
    destination set. The bulk OpenStreetMap import still leaves some entries
    with no image at all, and the interface renders those without a thumbnail,
    so an absent image_url is valid. What must not happen is a record pointing
    at a remote or missing file.
    """
    for place in _read_catalog("places"):
        image_url = place.get("image_url", "")
        if not image_url:
            continue

        assert image_url.startswith(("/images/places/", "/images/destinations/")), place["name"]
        assert (ROOT / "client" / "public" / image_url.lstrip("/")).exists(), place["name"]
        assert place.get("image_source_url"), place["name"]


def test_contextual_images_are_labelled_as_such():
    """A city photograph standing in for a place must say so.

    Without the flag the interface would silently imply the picture shows the
    place itself, which is the fastest way to lose a local user's trust.
    """
    for name in ("places", "hotels", "activities"):
        for record in _read_catalog(name):
            image_url = record.get("image_url", "")
            if image_url.startswith("/images/destinations/"):
                assert record.get("image_is_contextual") is True, record.get("name")
                assert record.get("image_context_note"), record.get("name")


def test_contextual_images_are_never_claimed_as_place_photos():
    for record in _read_catalog("places"):
        if record.get("image_is_contextual"):
            assert not record.get("image_url", "").startswith("/images/places/"), record["name"]


def test_destination_catalog_images_are_local_assets():
    for destination in _read_catalog("destinations"):
        image_url = destination.get("image_url", "")

        assert image_url.startswith("/images/destinations/"), destination["name"]
        assert (ROOT / "client" / "public" / image_url.lstrip("/")).exists(), destination["name"]
        assert destination.get("image_source_url"), destination["name"]


def test_curated_attractions_exist_across_regions():
    """The bulk import is shops and residences; the curated set is what a
    visitor is actually shown first, so it must cover the country."""
    curated = [p for p in _read_catalog("places") if p.get("curated")]
    assert len(curated) >= 25, f"only {len(curated)} curated attractions"

    regions = {p.get("region") for p in curated}
    assert len(regions) >= 8, f"curated sites only cover {sorted(regions)}"


def test_curated_attractions_are_presentable():
    """Every curated site needs the fields the place card and detail view read."""
    for place in _read_catalog("places"):
        if not place.get("curated"):
            continue
        name = place.get("name", "?")
        assert place.get("description"), name
        assert place.get("tags"), name
        assert place.get("latitude") and place.get("longitude"), name
        assert place.get("rating"), name
        assert place.get("reviews"), name


def test_place_videos_point_at_real_video_files():
    """A poster-frame JPEG stored as a video renders an empty player."""
    for place in _read_catalog("places"):
        for video in place.get("videos") or []:
            url = video.get("url", "")
            assert url.endswith((".webm", ".ogv", ".mp4")), f"{place['name']}: {url}"
            assert (ROOT / "client" / "public" / url.lstrip("/")).exists(), place["name"]
            assert video.get("source_url"), place["name"]
            assert video.get("license"), place["name"]
