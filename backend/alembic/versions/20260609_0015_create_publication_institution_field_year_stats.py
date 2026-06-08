"""create publication institution field year stats

Revision ID: 20260609_0015
Revises: 20260608_0014
Create Date: 2026-06-09 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260609_0015"
down_revision: Union[str, None] = "20260608_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "publication_institution_field_year_stats",
        sa.Column("institution_name", sa.String(length=300), primary_key=True),
        sa.Column("subfield", sa.String(length=100), primary_key=True),
        sa.Column("year", sa.SmallInteger(), primary_key=True),
        sa.Column("institution_ror_id", sa.String(length=100), nullable=True),
        sa.Column("institution_match_confidence", sa.Float(), nullable=True),
        sa.Column("institution_normalized", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("contributions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("papers", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_citations", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("avg_paper_citations", sa.Float(), nullable=False, server_default="0"),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_pifys_institution_year",
        "publication_institution_field_year_stats",
        ["institution_name", "year"],
    )
    op.create_index(
        "ix_pifys_subfield_year_contributions",
        "publication_institution_field_year_stats",
        ["subfield", "year", "contributions"],
    )
    op.create_index(
        "ix_pifys_institution_subfield_year",
        "publication_institution_field_year_stats",
        ["institution_name", "subfield", "year"],
    )


def downgrade() -> None:
    op.drop_index("ix_pifys_institution_subfield_year", table_name="publication_institution_field_year_stats")
    op.drop_index("ix_pifys_subfield_year_contributions", table_name="publication_institution_field_year_stats")
    op.drop_index("ix_pifys_institution_year", table_name="publication_institution_field_year_stats")
    op.drop_table("publication_institution_field_year_stats")
