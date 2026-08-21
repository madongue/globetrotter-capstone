"""One-time import of the JSON data files into a SQL database.

Reads every collection from a ``data/`` directory and writes it into the
database named by ``DATABASE_URL``, preserving document order.

Typical use, after provisioning a Postgres database and copying the live
``data/`` directory off the server:

    export DATABASE_URL="postgresql://user:pass@host/dbname"
    python scripts/migrate_json_to_db.py --data-dir ./data --dry-run
    python scripts/migrate_json_to_db.py --data-dir ./data

By default the script refuses to touch a collection that already has rows, so
re-running it cannot silently double-import or clobber live data. Pass
``--replace`` to overwrite a collection deliberately.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.store import SqlDocumentStore, key_field_for  # noqa: E402

#: Collections imported, in dependency-free order. Names match the JSON files.
COLLECTIONS = [
    "users",
    "itineraries",
    "destinations",
    "hotels",
    "activities",
    "places",
    "groups",
    "media",
    "notifications",
    "invites",
    "audit_log",
    "place_requests",
]


def load_collection(data_dir: Path, collection: str) -> list:
    """Return the documents in ``<data_dir>/<collection>.json``.

    A missing or empty file is treated as an empty collection, matching how
    the file backend behaves at runtime.
    """
    path = data_dir / f"{collection}.json"
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8").strip()
    if not content:
        return []
    documents = json.loads(content)
    if not isinstance(documents, list):
        raise ValueError(f"{path} does not contain a JSON list")
    return documents


def describe_key_collisions(collection: str, documents: list) -> list[str]:
    """Return warnings for documents that share, or lack, a natural key.

    The file backend tolerated duplicates; the database keys on them, so a
    collision means one document would be renamed to stay addressable. Callers
    surface these so a human can decide whether the data is actually corrupt.
    """
    field = key_field_for(collection)
    seen: dict[str, int] = {}
    warnings: list[str] = []
    for index, document in enumerate(documents):
        value = document.get(field)
        if value in (None, ""):
            warnings.append(
                f"  ! {collection}[{index}] has no '{field}'; will be keyed by position"
            )
            continue
        value = str(value)
        if value in seen:
            warnings.append(
                f"  ! {collection}[{index}] duplicates {field}={value!r} "
                f"(first seen at index {seen[value]})"
            )
        else:
            seen[value] = index
    return warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=str(ROOT / "data"),
        help="Directory holding the JSON data files (default: ./data)",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Target database URL (default: $DATABASE_URL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be imported without writing anything",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Overwrite collections that already contain rows",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        metavar="COLLECTION",
        help="Limit the import to these collections",
    )
    args = parser.parse_args()

    if not args.database_url:
        parser.error("no database URL: pass --database-url or set DATABASE_URL")

    data_dir = Path(args.data_dir)
    if not data_dir.is_dir():
        parser.error(f"data directory not found: {data_dir}")

    collections = args.only or COLLECTIONS
    unknown = [name for name in collections if name not in COLLECTIONS]
    if unknown:
        parser.error(f"unknown collection(s): {', '.join(unknown)}")

    store = SqlDocumentStore(args.database_url)
    print(f"Source: {data_dir}")
    print(f"Target: {args.database_url.split('@')[-1] or args.database_url}")
    print(f"Mode:   {'dry run' if args.dry_run else 'import'}\n")

    imported = skipped = 0
    for collection in collections:
        documents = load_collection(data_dir, collection)
        existing = store.read(collection)

        if not documents:
            print(f"- {collection}: nothing to import")
            continue

        for warning in describe_key_collisions(collection, documents):
            print(warning)

        if existing and not args.replace:
            print(
                f"- {collection}: SKIPPED, {len(existing)} row(s) already present "
                f"(use --replace to overwrite)"
            )
            skipped += 1
            continue

        verb = "would import" if args.dry_run else "imported"
        if not args.dry_run:
            store.write(collection, documents)
        note = f", replacing {len(existing)}" if existing else ""
        print(f"- {collection}: {verb} {len(documents)} document(s){note}")
        imported += 1

    print(
        f"\n{imported} collection(s) {'would be ' if args.dry_run else ''}imported, "
        f"{skipped} skipped."
    )
    if skipped and not args.replace:
        print("Re-run with --replace to overwrite the skipped collections.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
