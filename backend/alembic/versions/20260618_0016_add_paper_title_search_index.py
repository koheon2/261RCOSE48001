"""Add title-only paper search index.

Revision ID: 20260618_0016
Revises: 20260609_0015
Create Date: 2026-06-18
"""

from alembic import op


revision = "20260618_0016"
down_revision = "20260609_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_papers_title_search
            ON papers
            USING gin (to_tsvector('english'::regconfig, coalesce(title, '')))
            """
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_papers_title_search")
