"""
app/media_storage.py

Where uploaded photos, videos and trip documents are kept.

Two interchangeable backends, chosen by the ``CLOUDINARY_URL`` environment
variable:

``LocalUploadStore``
    Writes files under ``data/uploads/`` and serves them back through the app's
    own ``/api/uploads/<filename>`` route. The default, and what the test suite
    exercises.

``CloudinaryUploadStore``
    Uploads to Cloudinary and returns its absolute CDN URL, which the browser
    fetches directly. Needed in production: local files live on the container's
    disk, so on a host with an ephemeral filesystem every deploy or restart
    destroys every photo a user has posted.

Both return the same shape, so routes never branch on which one is active.
"""
from __future__ import annotations

import os
import uuid
from urllib.parse import unquote, urlparse

from werkzeug.utils import secure_filename


def build_upload_filename(original_filename: str) -> str:
    """Return a collision-proof, filesystem-safe name for an upload.

    The random prefix keeps two users uploading ``photo.jpg`` from overwriting
    each other, and ``secure_filename`` strips path separators so an attacker
    cannot escape the uploads directory.
    """
    return f"{uuid.uuid4().hex}-{secure_filename(original_filename)}"


def media_type_for(mimetype: str) -> str:
    """Classify an upload as ``video`` or ``photo`` from its MIME type."""
    return "video" if (mimetype or "").startswith("video/") else "photo"


class LocalUploadStore:
    """Save uploads to the local filesystem, served by the app itself.

    *uploads_dir* may be a path or a callable returning one. It is resolved on
    every save rather than captured once, because the test suite monkeypatches
    the directory between tests -- caching it would silently write every upload
    into the first test's temp directory.
    """

    #: Whether stored files are served by this app rather than an external CDN.
    serves_locally = True

    def __init__(self, uploads_dir):
        self._uploads_dir = uploads_dir

    @property
    def uploads_dir(self) -> str:
        return (
            self._uploads_dir()
            if callable(self._uploads_dir)
            else self._uploads_dir
        )

    def save(self, uploaded_file, folder: str = "") -> dict:
        filename = build_upload_filename(uploaded_file.filename)
        uploads_dir = self.uploads_dir
        os.makedirs(uploads_dir, exist_ok=True)
        uploaded_file.save(os.path.join(uploads_dir, filename))
        return {
            "url": f"/api/uploads/{filename}",
            "filename": filename,
            "type": media_type_for(uploaded_file.mimetype),
        }


def parse_cloudinary_url(cloudinary_url: str) -> tuple[str, str, str]:
    """Split ``cloudinary://<api_key>:<api_secret>@<cloud_name>`` into its parts.

    Raises ``ValueError`` on anything malformed, so a bad setting fails at
    startup rather than silently leaving uploads unconfigured.
    """
    parsed = urlparse(cloudinary_url)
    cloud_name = parsed.hostname or ""
    api_key = unquote(parsed.username or "")
    api_secret = unquote(parsed.password or "")

    if parsed.scheme != "cloudinary" or not (cloud_name and api_key and api_secret):
        raise ValueError(
            "CLOUDINARY_URL must look like "
            "cloudinary://<api_key>:<api_secret>@<cloud_name>"
        )
    return cloud_name, api_key, api_secret


class CloudinaryUploadStore:
    """Upload to Cloudinary and hand back its CDN URL.

    Configured from ``CLOUDINARY_URL``
    (``cloudinary://<api_key>:<api_secret>@<cloud_name>``), which the SDK reads
    on import.
    """

    serves_locally = False

    def __init__(self, cloudinary_url: str, base_folder: str = "globetrotter"):
        # Imported lazily so the dependency is only needed when configured.
        import cloudinary

        cloud_name, api_key, api_secret = parse_cloudinary_url(cloudinary_url)
        # Configured with explicit credentials rather than by handing the SDK
        # the URL: `cloudinary.config(cloudinary_url=...)` is silently ignored,
        # leaving the client unconfigured and every upload failing at runtime.
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True,
        )
        self._base_folder = base_folder

    def save(self, uploaded_file, folder: str = "") -> dict:
        import cloudinary.uploader

        media_type = media_type_for(uploaded_file.mimetype)
        filename = build_upload_filename(uploaded_file.filename)
        target_folder = (
            f"{self._base_folder}/{folder}" if folder else self._base_folder
        )
        # `auto` lets Cloudinary handle PDFs and other trip documents, which are
        # neither image nor video.
        resource_type = "video" if media_type == "video" else "auto"

        result = cloudinary.uploader.upload(
            uploaded_file,
            folder=target_folder,
            public_id=os.path.splitext(filename)[0],
            resource_type=resource_type,
            use_filename=False,
            unique_filename=False,
        )
        return {
            "url": result["secure_url"],
            "filename": filename,
            "type": media_type,
            "public_id": result.get("public_id", ""),
        }


def build_upload_store(uploads_dir: str, cloudinary_url: str | None = None):
    """Return the upload backend implied by the environment."""
    url = (
        cloudinary_url
        if cloudinary_url is not None
        else os.environ.get("CLOUDINARY_URL", "")
    )
    if url:
        return CloudinaryUploadStore(url)
    return LocalUploadStore(uploads_dir)


_upload_store = None


def get_upload_store():
    """Return the active upload backend, creating it on first use.

    The uploads directory is resolved from :mod:`app.models` on every save
    rather than captured, because the test suite monkeypatches it to a temp
    directory between tests.
    """
    global _upload_store
    if _upload_store is None:
        import app.models

        _upload_store = build_upload_store(lambda: app.models.UPLOADS_DIR)
    return _upload_store


def reset_upload_store() -> None:
    """Drop the cached backend so the next call re-reads the environment."""
    global _upload_store
    _upload_store = None
