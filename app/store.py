"""
app/store.py

Storage backends for the JSON document collections in :mod:`app.models`.

The application stores every collection (users, itineraries, places, ...) as a
list of dictionaries. Two interchangeable backends implement that shape:

``JsonFileStore``
    Reads and writes ``data/*.json`` on the local filesystem, guarded by a
    per-file lock with atomic replaces. This is the historical behaviour and
    remains the default for local development and the test suite.

``SqlDocumentStore``
    Persists the same documents as rows in a single ``documents`` table, keyed
    by ``(collection, doc_key)``. Used in production so data survives redeploys
    on hosts with an ephemeral filesystem (Render, Heroku, Fly, ...), where
    anything written to local disk is lost on every restart.

Which backend is active is decided once, at import time, by ``DATABASE_URL``:
set it and the SQL store is used; leave it unset and JSON files are used.
"""
from __future__ import annotations

import hashlib
import json
import os
from abc import ABC, abstractmethod
from contextlib import contextmanager

from filelock import FileLock


# ---------------------------------------------------------------------------
# Collection identity
# ---------------------------------------------------------------------------
#
# models.py addresses collections by their data-file path (USERS_FILE, ...) and
# the test suite monkeypatches those constants to temp files. Deriving the
# collection name from the file's basename keeps both backends addressable by
# the same key, so no caller has to change and the tests keep working.

def collection_name_for(filepath: str) -> str:
    """Return the logical collection name for a data-file path.

    ``/anything/users.json`` -> ``users``
    """
    return os.path.splitext(os.path.basename(str(filepath)))[0]


class DocumentStore(ABC):
    """A named collection of JSON documents, preserving insertion order."""

    @abstractmethod
    def read(self, collection: str) -> list:
        """Return every document in *collection*, in insertion order."""

    @abstractmethod
    def write(self, collection: str, documents: list) -> None:
        """Replace the entire contents of *collection* with *documents*."""

    @abstractmethod
    @contextmanager
    def locked(self, collection: str):
        """Hold an exclusive lock on *collection* for the duration of the block.

        Callers use this to make a read-modify-write sequence atomic against
        concurrent workers.
        """


# ---------------------------------------------------------------------------
# JSON file backend
# ---------------------------------------------------------------------------

class JsonFileStore(DocumentStore):
    """Store documents as ``data/<collection>.json`` files.

    *path_resolver* maps a collection name back to an absolute file path. It is
    called on every operation rather than cached, because the test suite
    monkeypatches the path constants in :mod:`app.models` between tests.
    """

    def __init__(self, path_resolver):
        self._path_for = path_resolver

    def _lock_path(self, filepath: str) -> str:
        return filepath + ".lock"

    @contextmanager
    def locked(self, collection: str):
        filepath = self._path_for(collection)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with FileLock(self._lock_path(filepath), timeout=10):
            yield

    def read(self, collection: str) -> list:
        filepath = self._path_for(collection)
        if not os.path.exists(filepath):
            return []
        with open(filepath, "r", encoding="utf-8") as fh:
            content = fh.read().strip()
            if not content:
                return []
            data = json.loads(content)
        return data if isinstance(data, list) else []

    def write(self, collection: str, documents: list) -> None:
        filepath = self._path_for(collection)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        # Write to a temp file and rename, so a process killed mid-write can
        # never leave truncated or invalid JSON behind.
        tmp_path = f"{filepath}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(documents, fh, indent=2)
        os.replace(tmp_path, filepath)


# ---------------------------------------------------------------------------
# SQL backend
# ---------------------------------------------------------------------------
#
# Every document lives in one table:
#
#     documents(collection, doc_key, ordinal, data)
#
# ``doc_key`` is the document's natural identifier (``id`` for most
# collections, ``username`` for users, ``token`` for invites) so that updating
# one record touches one row instead of rewriting the whole collection.
# ``ordinal`` preserves insertion order, which append-only collections such as
# the audit log depend on. (Named ``ordinal`` rather than ``position`` because
# POSITION is a SQL keyword that SQLAlchemy does not quote.)

#: Natural key for each collection. Collections absent from this map fall back
#: to ``id``, and documents with no usable key get a generated surrogate.
COLLECTION_KEYS = {
    "users": "username",
    "invites": "token",
    # The curated destination seed data predates the `id` convention and is
    # read-only at runtime; its names are unique and stable.
    "destinations": "name",
}

DEFAULT_KEY_FIELD = "id"


def key_field_for(collection: str) -> str:
    return COLLECTION_KEYS.get(collection, DEFAULT_KEY_FIELD)


class SqlDocumentStore(DocumentStore):
    """Store documents as rows in a SQL table (Postgres in production).

    A single connection-level advisory/transaction lock is used for
    :meth:`locked`, so concurrent web workers serialise their read-modify-write
    sequences the same way the file backend does with ``filelock``.
    """

    def __init__(self, database_url: str, echo: bool = False):
        from sqlalchemy import (
            Column,
            Integer,
            MetaData,
            String,
            Table,
            create_engine,
        )
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.types import JSON

        # Render and several other hosts still hand out legacy ``postgres://``
        # URLs, which SQLAlchemy 2 no longer recognises.
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        # Prefer the psycopg 3 driver when the URL does not name one.
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )

        self._is_sqlite = database_url.startswith("sqlite")
        engine_kwargs = {"echo": echo, "future": True}
        if not self._is_sqlite:
            # Recycle before typical managed-Postgres idle timeouts, and check
            # liveness so a dropped connection surfaces as a retry, not a 500.
            engine_kwargs.update(pool_pre_ping=True, pool_recycle=280)

        self._engine = create_engine(database_url, **engine_kwargs)
        self._metadata = MetaData()
        json_type = JSON().with_variant(JSONB, "postgresql")
        self._documents = Table(
            "documents",
            self._metadata,
            Column("collection", String(64), primary_key=True),
            Column("doc_key", String(255), primary_key=True),
            Column("ordinal", Integer, nullable=False),
            Column("data", json_type, nullable=False),
        )
        self._metadata.create_all(self._engine)

    @property
    def engine(self):
        return self._engine

    #: Must match the doc_key column width below.
    MAX_KEY_LENGTH = 255

    def _doc_key(self, collection: str, document: dict, index: int) -> str:
        field = key_field_for(collection)
        value = document.get(field)
        if value in (None, ""):
            # Append-only collections (audit_log, notifications from older
            # data) may lack a key; fall back to position so the row is still
            # addressable and ordering is preserved.
            return f"__pos_{index}"

        key = str(value)
        if len(key) > self.MAX_KEY_LENGTH:
            # Postgres enforces the column width where the JSON files did not,
            # so an over-long key would turn into a 500. Substitute a digest
            # that is still stable and unique for that value.
            digest = hashlib.blake2b(key.encode("utf-8"), digest_size=16).hexdigest()
            return f"__hash_{digest}"
        return key

    @staticmethod
    def _advisory_lock_key(collection: str) -> int:
        """Map a collection name to a stable signed 64-bit advisory lock key.

        Computed here rather than with Postgres' ``hashtext()``, which is an
        undocumented internal function, and hashed explicitly rather than with
        ``hash()``, which is randomised per process and so would hand different
        workers different keys for the same collection.
        """
        digest = hashlib.blake2b(collection.encode("utf-8"), digest_size=8).digest()
        return int.from_bytes(digest, "big", signed=True)

    @contextmanager
    def locked(self, collection: str):
        from sqlalchemy import text

        with self._engine.begin() as connection:
            if not self._is_sqlite:
                # Serialise writers for this collection across all workers. The
                # lock is released when this transaction ends, i.e. on exit.
                connection.execute(
                    text("SELECT pg_advisory_xact_lock(:key)"),
                    {"key": self._advisory_lock_key(collection)},
                )
            yield

    def read(self, collection: str) -> list:
        from sqlalchemy import select

        table = self._documents
        with self._engine.connect() as connection:
            rows = connection.execute(
                select(table.c.data)
                .where(table.c.collection == collection)
                .order_by(table.c.ordinal)
            ).all()
        return [row[0] for row in rows]

    def write(self, collection: str, documents: list) -> None:
        from sqlalchemy import delete

        table = self._documents
        payload = []
        seen = set()
        for index, document in enumerate(documents):
            doc_key = self._doc_key(collection, document, index)
            # Guard against duplicate natural keys, which the file backend
            # tolerated silently but a primary key will not.
            if doc_key in seen:
                doc_key = f"{doc_key}__dup_{index}"
            seen.add(doc_key)
            payload.append(
                {
                    "collection": collection,
                    "doc_key": doc_key,
                    "ordinal": index,
                    "data": document,
                }
            )

        with self._engine.begin() as connection:
            connection.execute(delete(table).where(table.c.collection == collection))
            if payload:
                connection.execute(table.insert(), payload)


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

def build_store(path_resolver, database_url: str | None = None) -> DocumentStore:
    """Return the store implied by the environment.

    ``DATABASE_URL`` selects the SQL backend; without it the JSON files under
    ``data/`` are used, which keeps local development and the test suite
    working with no configuration.
    """
    url = database_url if database_url is not None else os.environ.get("DATABASE_URL", "")
    if url:
        return SqlDocumentStore(url)
    return JsonFileStore(path_resolver)
