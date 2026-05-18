"""Service configuration. Reads from environment, validates via Pydantic."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = ""
    environment: str = "development"
    log_level: str = "INFO"

    # Path to rule pack JSON files. Defaults to the bundled directory.
    rule_packs_dir: Path = Path(__file__).parent / "rule_packs"

    # R2 / S3 storage for generated labels
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "ilaunchify-dev"
    r2_public_url: str = ""


settings = Settings()
