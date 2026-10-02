"""sync_schema(): upgrades databases created by earlier versions without losing data."""
from sqlalchemy import create_engine, inspect, text

import database


def test_adds_new_columns_to_existing_tables(tmp_path, monkeypatch):
    legacy = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy.begin() as conn:
        conn.execute(text("""
            CREATE TABLE corporate_entities (
                id INTEGER PRIMARY KEY, company_name VARCHAR NOT NULL,
                registration_number VARCHAR NOT NULL UNIQUE, country_of_incorporation VARCHAR,
                ai_risk_score FLOAT, created_at DATETIME)
        """))
        conn.execute(text("INSERT INTO corporate_entities (company_name, registration_number) VALUES ('Old Co', 'OLD-1')"))

    monkeypatch.setattr(database, "engine", legacy)
    database.sync_schema()

    inspector = inspect(legacy)
    assert "document_key" in {c["name"] for c in inspector.get_columns("corporate_entities")}
    assert {"document_jobs", "transaction_ledgers", "beneficial_owners"} <= set(inspector.get_table_names())
    with legacy.connect() as conn:
        assert conn.execute(text("SELECT company_name FROM corporate_entities")).scalar() == "Old Co"


def test_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "engine", create_engine(f"sqlite:///{tmp_path / 'fresh.db'}"))
    database.sync_schema()
    database.sync_schema()
