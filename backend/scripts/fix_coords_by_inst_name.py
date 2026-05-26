"""
Backfill researchers.lat/lng using KNOWN_COORDS from fix_coords_by_name.py,
matched by exact institution name. Targets rows where lat IS NULL.

Usage:
    cd backend
    .venv/bin/python -m scripts.fix_coords_by_inst_name [--dry-run]
"""
import argparse
import asyncio
import logging
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.database import AsyncSessionLocal
from scripts.fix_coords_by_name import KNOWN_COORDS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

JITTER_M = 50


def jitter(lat: float, lng: float) -> tuple[float, float]:
    dlat = (random.uniform(-1, 1) * JITTER_M) / 111_320
    dlng = (random.uniform(-1, 1) * JITTER_M) / (111_320 * math.cos(math.radians(lat)))
    return lat + dlat, lng + dlng


async def main(args):
    total = 0
    async with AsyncSessionLocal() as db:
        for name, (lat, lng) in KNOWN_COORDS.items():
            r = await db.execute(
                text("SELECT id FROM researchers WHERE institution = :n AND lat IS NULL"),
                {"n": name},
            )
            ids = [row[0] for row in r.fetchall()]
            if not ids:
                continue
            logger.info(f"  {len(ids):>5}  {name} → ({lat:.4f}, {lng:.4f})")
            if args.dry_run:
                total += len(ids)
                continue
            batch = [{"id": rid, "lat": jl, "lng": jg}
                     for rid in ids
                     for jl, jg in [jitter(lat, lng)]]
            for i in range(0, len(batch), 1000):
                await db.execute(
                    text("UPDATE researchers SET lat = :lat, lng = :lng WHERE id = :id"),
                    batch[i:i + 1000],
                )
            await db.commit()
            total += len(ids)

    if args.dry_run:
        logger.info(f"\n[DRY-RUN] would update {total} researchers")
    else:
        logger.info(f"\nDONE — updated {total} researchers")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    asyncio.run(main(p.parse_args()))
