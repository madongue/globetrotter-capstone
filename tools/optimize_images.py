"""Resize and recompress catalogue imagery for the web.

Several curated photographs are several megabytes straight from Wikimedia,
which is fine for an archive and far too heavy for a phone on mobile data --
the largest was 4 MB for a single hero image. This caps dimensions and
recompresses as progressive JPEG, rewriting each file in place.

    python tools/optimize_images.py --dry-run
    python tools/optimize_images.py
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIRS = [
    ROOT / "client" / "public" / "images" / "destinations",
    ROOT / "client" / "public" / "images" / "places",
]

#: Wide enough for a full-bleed hero on a high-density display, without
#: carrying print-resolution pixels to a phone.
MAX_EDGE = 1800
QUALITY = 82

#: Leave small files alone; recompressing them gains nothing and can lose detail.
SKIP_BELOW_BYTES = 180 * 1024


def optimize(path: Path, dry_run: bool) -> tuple[int, int]:
    """Return (bytes_before, bytes_after) for *path*."""
    before = path.stat().st_size
    if before < SKIP_BELOW_BYTES:
        return before, before

    with Image.open(path) as image:
        # Honour EXIF orientation before discarding the metadata.
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        width, height = image.size
        if max(width, height) > MAX_EDGE:
            scale = MAX_EDGE / max(width, height)
            image = image.resize(
                (round(width * scale), round(height * scale)), Image.LANCZOS
            )

        if dry_run:
            return before, before

        image.save(
            path,
            "JPEG",
            quality=QUALITY,
            optimize=True,
            progressive=True,
        )

    return before, path.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    total_before = total_after = 0
    changed = 0

    for directory in IMAGE_DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.iterdir()):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            try:
                before, after = optimize(path, args.dry_run)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {path.name}: {exc}")
                continue

            total_before += before
            total_after += after
            if after < before:
                changed += 1
                print(
                    f"  {path.name:44} {before // 1024:>5} KB -> {after // 1024:>5} KB"
                )

    saved = total_before - total_after
    print(
        f"\n{changed} file(s) shrunk. "
        f"{total_before // 1024} KB -> {total_after // 1024} KB "
        f"(saved {saved // 1024} KB)"
    )
    if args.dry_run:
        print("Dry run: nothing was written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
