"""Tests for the upload backends in :mod:`app.media_storage`.

The local backend is what the rest of the suite exercises end to end. The
Cloudinary backend is driven with a stub here, since exercising it for real
would need live credentials and would upload to someone's account on every run.
"""
import os
import sys
import types

import pytest

from app import media_storage
from app.media_storage import (
    CloudinaryUploadStore,
    LocalUploadStore,
    build_upload_filename,
    build_upload_store,
    media_type_for,
    parse_cloudinary_url,
)


class FakeUpload:
    """Stands in for a Werkzeug FileStorage."""

    def __init__(self, filename="photo.jpg", mimetype="image/jpeg", content=b"data"):
        self.filename = filename
        self.mimetype = mimetype
        self._content = content

    def save(self, path):
        with open(path, "wb") as fh:
            fh.write(self._content)


# ---------------------------------------------------------------------------
# Filename and type helpers
# ---------------------------------------------------------------------------

def test_upload_filenames_are_unique_per_upload():
    """Two users uploading photo.jpg must not overwrite each other."""
    names = {build_upload_filename("photo.jpg") for _ in range(50)}
    assert len(names) == 50


def test_upload_filenames_cannot_escape_the_uploads_directory():
    """A traversal payload must not survive into the stored path."""
    for hostile in ("../../etc/passwd", "..\\..\\windows\\system32\\cfg", "/etc/shadow"):
        filename = build_upload_filename(hostile)
        assert ".." not in filename
        assert "/" not in filename and "\\" not in filename


def test_upload_filenames_keep_the_original_extension():
    assert build_upload_filename("holiday.PNG").endswith(".PNG")
    assert build_upload_filename("clip.mp4").endswith(".mp4")


@pytest.mark.parametrize(
    "mimetype,expected",
    [
        ("video/mp4", "video"),
        ("video/quicktime", "video"),
        ("image/jpeg", "photo"),
        ("application/pdf", "photo"),
        ("", "photo"),
        (None, "photo"),
    ],
)
def test_media_type_classification(mimetype, expected):
    assert media_type_for(mimetype) == expected


# ---------------------------------------------------------------------------
# Local backend
# ---------------------------------------------------------------------------

def test_local_store_writes_the_file_and_returns_an_app_url(tmp_path):
    store = LocalUploadStore(str(tmp_path))
    result = store.save(FakeUpload(content=b"hello"))

    assert result["url"] == f"/api/uploads/{result['filename']}"
    assert result["type"] == "photo"
    assert (tmp_path / result["filename"]).read_bytes() == b"hello"


def test_local_store_creates_the_directory_if_absent(tmp_path):
    target = tmp_path / "not-yet-there"
    store = LocalUploadStore(str(target))
    result = store.save(FakeUpload())
    assert (target / result["filename"]).exists()


def test_local_store_resolves_its_directory_on_every_save(tmp_path):
    """Capturing the path once would send later uploads to a stale directory."""
    first, second = tmp_path / "a", tmp_path / "b"
    current = {"dir": str(first)}
    store = LocalUploadStore(lambda: current["dir"])

    store.save(FakeUpload())
    current["dir"] = str(second)
    store.save(FakeUpload())

    assert len(list(first.iterdir())) == 1
    assert len(list(second.iterdir())) == 1


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

def test_local_backend_is_used_when_cloudinary_is_not_configured(tmp_path, monkeypatch):
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)
    store = build_upload_store(str(tmp_path))
    assert isinstance(store, LocalUploadStore)
    assert store.serves_locally is True


def test_cloudinary_backend_is_used_when_configured(tmp_path, monkeypatch):
    _install_fake_cloudinary(monkeypatch)
    store = build_upload_store(
        str(tmp_path), cloudinary_url="cloudinary://key:secret@cloudname"
    )
    assert isinstance(store, CloudinaryUploadStore)
    assert store.serves_locally is False


def test_get_upload_store_is_cached_and_resettable(tmp_path, monkeypatch):
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)
    media_storage.reset_upload_store()

    first = media_storage.get_upload_store()
    assert media_storage.get_upload_store() is first

    media_storage.reset_upload_store()
    assert media_storage.get_upload_store() is not first


# ---------------------------------------------------------------------------
# Cloudinary backend (stubbed)
# ---------------------------------------------------------------------------

def _install_fake_cloudinary(monkeypatch, capture=None):
    """Register a stub `cloudinary` package so no network call is made."""
    cloudinary = types.ModuleType("cloudinary")
    uploader = types.ModuleType("cloudinary.uploader")

    cloudinary.config = lambda **kwargs: capture.setdefault("config", kwargs) if capture is not None else None

    def upload(file_obj, **kwargs):
        if capture is not None:
            capture["upload"] = kwargs
            capture["file"] = file_obj
        public_id = kwargs.get("public_id", "generated")
        return {
            "secure_url": f"https://res.cloudinary.com/demo/{public_id}",
            "public_id": public_id,
        }

    uploader.upload = upload
    cloudinary.uploader = uploader
    monkeypatch.setitem(sys.modules, "cloudinary", cloudinary)
    monkeypatch.setitem(sys.modules, "cloudinary.uploader", uploader)
    return capture


def test_cloudinary_store_returns_the_cdn_url(monkeypatch):
    capture = _install_fake_cloudinary(monkeypatch, {})
    store = CloudinaryUploadStore("cloudinary://key:secret@cloudname")

    result = store.save(FakeUpload("beach.jpg"), folder="places")

    assert result["url"].startswith("https://res.cloudinary.com/")
    assert result["type"] == "photo"
    assert capture["upload"]["folder"] == "globetrotter/places"


def test_cloudinary_store_marks_videos_as_video_resources(monkeypatch):
    capture = _install_fake_cloudinary(monkeypatch, {})
    store = CloudinaryUploadStore("cloudinary://key:secret@cloudname")

    result = store.save(FakeUpload("clip.mp4", mimetype="video/mp4"), folder="media")

    assert result["type"] == "video"
    assert capture["upload"]["resource_type"] == "video"


def test_cloudinary_store_uses_auto_for_documents(monkeypatch):
    """Trip documents are often PDFs, which are neither image nor video."""
    capture = _install_fake_cloudinary(monkeypatch, {})
    store = CloudinaryUploadStore("cloudinary://key:secret@cloudname")

    store.save(FakeUpload("booking.pdf", mimetype="application/pdf"), folder="documents")

    assert capture["upload"]["resource_type"] == "auto"


def test_cloudinary_store_does_not_write_to_local_disk(tmp_path, monkeypatch):
    """The whole point: nothing lands on the ephemeral filesystem."""
    _install_fake_cloudinary(monkeypatch, {})
    monkeypatch.chdir(tmp_path)
    store = CloudinaryUploadStore("cloudinary://key:secret@cloudname")

    store.save(FakeUpload())

    assert list(tmp_path.iterdir()) == []


# ---------------------------------------------------------------------------
# Cloudinary configuration against the real SDK
#
# The stubbed tests above cannot catch a wrong SDK call, so these exercise the
# installed cloudinary package directly. No network happens: configuring the
# client and reading its settings back is entirely local.
# ---------------------------------------------------------------------------

def test_cloudinary_url_is_parsed_into_its_three_credentials():
    assert parse_cloudinary_url("cloudinary://key123:secret456@my-cloud") == (
        "my-cloud",
        "key123",
        "secret456",
    )


def test_cloudinary_url_percent_escapes_are_decoded():
    """Secrets routinely contain characters that must be escaped in a URL."""
    _, _, secret = parse_cloudinary_url("cloudinary://key:a%2Fb%2Bc@cloud")
    assert secret == "a/b+c"


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://key:secret@cloud",   # wrong scheme
        "cloudinary://cloud-only",   # no credentials
        "cloudinary://key@cloud",    # no secret
        "not-a-url",
        "",
    ],
)
def test_malformed_cloudinary_urls_are_rejected(bad_url):
    """A bad setting must fail loudly, not leave uploads silently misconfigured."""
    with pytest.raises(ValueError):
        parse_cloudinary_url(bad_url)


def test_real_cloudinary_sdk_receives_the_credentials(monkeypatch):
    """Regression guard: `config(cloudinary_url=...)` is silently ignored by the
    SDK, which left the client unconfigured and every upload failing."""
    cloudinary = pytest.importorskip("cloudinary")
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)

    CloudinaryUploadStore("cloudinary://999888777:sEcReT123@my-cloud")

    config = cloudinary.config()
    assert config.cloud_name == "my-cloud"
    assert config.api_key == "999888777"
    assert config.api_secret == "sEcReT123"
    assert config.secure is True
