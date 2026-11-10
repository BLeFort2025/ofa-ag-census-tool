"""
Shared helpers for the OFA County Profiles 2.0 data pipeline (Phase 1: data acquisition).

Every source script in data-pipeline/profiles/ follows the same contract:

1. Raw downloads are cached under   data-pipeline/raw/profiles/<source_id>/   (git-ignored).
2. Each source writes ONE tidy long-format CSV to
       data-pipeline/processed/profiles/<source_id>.csv
   using exactly the columns in TIDY_COLUMNS (see write_tidy()).
3. Each source registers itself via register_source() (writes processed/profiles/manifest/<source_id>.json,
   merged into processed/profiles/sources_manifest.json)
   (publisher, title, URL, licence, vintage, retrieval date, method notes, caveats).
4. Each source writes a short QA report to data-pipeline/processed/profiles/qa/<source_id>.md
   listing every automated check and whether it passed.

Evidence rules (OFA user rule): never invent, impute or estimate values silently.
 - Suppressed / unavailable values are written with value = "" and a status_flag explaining why.
 - Any derived or estimated number must carry is_estimate = 1 and a method note.
"""

from __future__ import annotations

import csv
import datetime as _dt
import io
import json
import os
import urllib.request
import zipfile
from pathlib import Path
from typing import Iterable

PROJECT_DIR = Path(__file__).resolve().parents[2]
PIPELINE_DIR = PROJECT_DIR / "data-pipeline"
RAW_CUBES_DIR = PIPELINE_DIR / "raw" / "cubes"
RAW_PROFILES_DIR = PIPELINE_DIR / "raw" / "profiles"
PROCESSED_DIR = PIPELINE_DIR / "processed" / "profiles"
QA_DIR = PROCESSED_DIR / "qa"
MANIFEST_PATH = PROCESSED_DIR / "sources_manifest.json"
MANIFEST_PARTS_DIR = PROCESSED_DIR / "manifest"

for _d in (RAW_PROFILES_DIR, PROCESSED_DIR, QA_DIR):
    _d.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (OFA AgCensus IQ data pipeline; research use)"

# Tidy long-format schema shared by every source
TIDY_COLUMNS = [
    "source_id",       # e.g. "omafa_fcr_county"
    "table_id",        # e.g. "32-10-0241-01" or "fcrcty_en.xlsx:FCR2021_EN"
    "ref_year",        # reference year of the value (int)
    "ref_period",      # optional finer period, e.g. "2023-12" for business counts
    "geo_level",       # PROVINCE | CAR | CD | CCS | CSD | ZONE | OMAFA_REGION
    "geo_code",        # StatCan code: "35", "3540", "3540005"; zones "Z07"
    "geo_dguid",       # StatCan 2021 DGUID where available
    "geo_name",
    "indicator_id",    # stable snake_case id
    "indicator_label", # human-readable label as published
    "category",        # grouping for profile tabs
    "uom",             # Number | Dollars | Acres | Head | Percent | Square feet | $ millions ...
    "value",           # numeric as string, or "" if suppressed/unavailable
    "status_flag",     # "" | x (suppressed) | .. (not available) | F (too unreliable) | E (use with caution) | placeholder | other
    "is_estimate",     # 0 = published value; 1 = derived/estimated by OFA pipeline (method in note)
    "note",
]

ONTARIO_PR = "35"


def now_iso() -> str:
    return _dt.datetime.now().replace(microsecond=0).isoformat()


def http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def download_file(url: str, dest: Path, overwrite: bool = False, timeout: int = 300) -> Path:
    """Download url to dest (cached unless overwrite)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not overwrite and dest.stat().st_size > 0:
        return dest
    data = http_get(url, timeout=timeout)
    dest.write_bytes(data)
    return dest


def statcan_cube_csv(pid: int, dest_dir: Path | None = None, overwrite: bool = False) -> Path:
    """Download a full StatCan WDS table (CSV) by 8-digit product id, e.g. 33100808. Returns csv path."""
    dest_dir = dest_dir or RAW_CUBES_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    csv_path = dest_dir / f"{pid}.csv"
    if csv_path.exists() and not overwrite:
        return csv_path
    info = json.loads(http_get(f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{pid}/en", timeout=60))
    zbytes = http_get(info["object"], timeout=600)
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        for name in zf.namelist():
            target = dest_dir / (f"{pid}_MetaData.csv" if name.endswith("MetaData.csv") else f"{pid}.csv")
            if name.endswith(".csv"):
                with zf.open(name) as src, open(target, "wb") as dst:
                    dst.write(src.read())
    return csv_path


def statcan_cube_metadata(pids: Iterable[int]) -> dict[int, dict]:
    """Fetch WDS cube metadata (title, dates, dimensions) for a list of product ids."""
    pids = list(pids)
    out: dict[int, dict] = {}
    for i in range(0, len(pids), 25):
        batch = [{"productId": p} for p in pids[i:i + 25]]
        req = urllib.request.Request(
            "https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata",
            data=json.dumps(batch).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            for r in json.loads(resp.read().decode("utf-8")):
                if r.get("status") == "SUCCESS":
                    out[int(r["object"]["productId"])] = r["object"]
    return out


def pid_to_table_id(pid: int | str) -> str:
    """33100808 -> '33-10-0808-01'."""
    s = str(pid)
    return f"{s[0:2]}-{s[2:4]}-{s[4:8]}-01"


def parse_statcan_geo_code(geo: str) -> str:
    """'Huron, Ontario [3540]' -> '3540'; 'Canada [000000000]' -> '000000000'."""
    if "[" in geo and geo.endswith("]"):
        return geo[geo.rfind("[") + 1:-1].strip()
    return ""


def dguid_level(dguid: str) -> str:
    """Infer geo level from a StatCan 2021 DGUID."""
    if not dguid:
        return ""
    if dguid.startswith("2021A000011124"):
        return "COUNTRY"
    if dguid.startswith("2021A0002"):
        return "PROVINCE"
    if dguid.startswith("2021A0003"):
        return "CD"
    if dguid.startswith("2021A0005"):
        return "CSD"
    if dguid.startswith("2021S0502"):
        return "CCS"
    if dguid.startswith("2021S0500"):
        return "CAR"
    return "OTHER"


def write_tidy(source_id: str, rows: list[dict]) -> Path:
    """Write rows (dicts) to processed/profiles/<source_id>.csv using TIDY_COLUMNS."""
    path = PROCESSED_DIR / f"{source_id}.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=TIDY_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            out = {k: r.get(k, "") for k in TIDY_COLUMNS}
            out["source_id"] = out["source_id"] or source_id
            out["is_estimate"] = int(out["is_estimate"] or 0)
            w.writerow(out)
    return path


def register_source(source_id: str, **meta) -> None:
    """Write the source's manifest entry. Expected keys: publisher, title, url, licence,
    vintage, geography, retrieved, method, caveats (list), row_count, output_file, script.

    Each source writes its own file (processed/profiles/manifest/<source_id>.json) so that
    scripts running in parallel never overwrite each other; the combined
    sources_manifest.json is rebuilt by merge_manifest()."""
    meta.setdefault("retrieved", now_iso())
    MANIFEST_PARTS_DIR.mkdir(parents=True, exist_ok=True)
    (MANIFEST_PARTS_DIR / f"{source_id}.json").write_text(
        json.dumps({source_id: meta}, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    merge_manifest()


def merge_manifest() -> dict:
    """Merge processed/profiles/manifest/*.json into sources_manifest.json."""
    merged: dict = {}
    for p in sorted(MANIFEST_PARTS_DIR.glob("*.json")):
        try:
            merged.update(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    tmp = MANIFEST_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, MANIFEST_PATH)
    return merged


class QAReport:
    """Collects pass/fail checks and writes processed/profiles/qa/<source_id>.md."""

    def __init__(self, source_id: str, title: str):
        self.source_id = source_id
        self.title = title
        self.checks: list[tuple[str, bool, str]] = []
        self.notes: list[str] = []

    def check(self, name: str, passed: bool, detail: str = "") -> bool:
        self.checks.append((name, bool(passed), detail))
        print(f"  [{'PASS' if passed else 'FAIL'}] {name} {detail}")
        return passed

    def note(self, text: str) -> None:
        self.notes.append(text)

    @property
    def all_passed(self) -> bool:
        return all(p for _, p, _ in self.checks)

    def write(self) -> Path:
        n_pass = sum(1 for _, p, _ in self.checks if p)
        lines = [
            f"# QA report: {self.title}",
            "",
            f"- Source id: `{self.source_id}`",
            f"- Generated: {now_iso()}",
            f"- Checks passed: **{n_pass} / {len(self.checks)}**",
            "",
            "| Check | Result | Detail |",
            "|---|---|---|",
        ]
        for name, passed, detail in self.checks:
            lines.append(f"| {name} | {'PASS' if passed else '**FAIL**'} | {detail.replace('|', '/')} |")
        if self.notes:
            lines += ["", "## Notes", ""] + [f"- {n}" for n in self.notes]
        path = QA_DIR / f"{self.source_id}.md"
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path


def to_num(v) -> float | None:
    """Parse a numeric string; return None for blanks and StatCan symbols."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if s in ("", "x", "X", "..", "...", "F", "-", "—", "n/a", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fmt_num(v: float | None) -> str:
    if v is None:
        return ""
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return repr(round(v, 6))
