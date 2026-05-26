"""optimize paper timeline queries

Revision ID: 20260520_0013
Revises: 20260428_0012
Create Date: 2026-05-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260520_0013"
down_revision: Union[str, None] = "20260428_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE INDEX ix_papers_text_search
    ON papers
    USING GIN (
        to_tsvector(
            'english'::regconfig,
            coalesce(title, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(abstract, '')
        )
    )
    """)
    op.create_index(
        "ix_paper_facet_summary_axis_count",
        "paper_facet_summary",
        ["facet_type", "paper_count"],
    )
    op.create_index(
        "ix_pa_paper_position",
        "paper_authors",
        ["paper_id", "position"],
    )
    op.create_index(
        "ix_pqf_paper_severity",
        "paper_quality_flags",
        ["paper_id", "severity"],
    )
    op.create_index(
        "ix_papers_topic_year_citations",
        "papers",
        ["topic", "year", "citations"],
    )
    op.create_index(
        "ix_papers_year_citations",
        "papers",
        ["year", "citations"],
    )


def downgrade() -> None:
    op.drop_index("ix_papers_year_citations", table_name="papers")
    op.drop_index("ix_papers_topic_year_citations", table_name="papers")
    op.drop_index("ix_pqf_paper_severity", table_name="paper_quality_flags")
    op.drop_index("ix_pa_paper_position", table_name="paper_authors")
    op.drop_index("ix_paper_facet_summary_axis_count", table_name="paper_facet_summary")
    op.drop_index("ix_papers_text_search", table_name="papers")
