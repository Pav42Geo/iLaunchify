"""Label PDF + SVG rendering via WeasyPrint.

Two output formats from the same template:
  - PDF: for direct creator preview download + composition into print files
  - SVG: for embedding into the design canvas as vector (per CANVAS_ENGINE.md)

The print export pipeline (services/exports) consumes the SVG output and
composites it into the final CMYK PDF for print providers.
"""
from __future__ import annotations

import io
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML  # type: ignore[import-not-found]

from app.schemas import PanelData

_template_dir = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_template_dir),
    autoescape=select_autoescape(["html", "xml"]),
    keep_trailing_newline=True,
)


def render_panel_html(panel: PanelData) -> str:
    """Render the FDA panel as HTML — entry point for both PDF and SVG flows."""
    is_supplement = panel.format == "SUPPLEMENT_FACTS"
    template_name = "supplement_facts.html" if is_supplement else "nutrition_facts.html"
    tpl = _env.get_template(template_name)

    return tpl.render(
        title="Supplement Facts" if is_supplement else "Nutrition Facts",
        serving_size=panel.serving_size,
        servings_per_container=panel.servings_per_container,
        rows=panel.rows,
        required_footer=panel.required_footer,
        required_warnings=panel.required_warnings,
    )


def render_panel_pdf(panel: PanelData) -> bytes:
    """Render the FDA panel as a PDF byte string.

    The output is a small single-page PDF sized to the panel's natural width
    (~280px / ~73mm at typical label resolution).
    """
    html = render_panel_html(panel)
    out = io.BytesIO()
    HTML(string=html).write_pdf(out)
    return out.getvalue()


def render_panel_svg(panel: PanelData) -> str:
    """Render the FDA panel as SVG markup.

    For V1, we emit a `<foreignObject>` wrapping the HTML — most modern
    PDF renderers (including the export pipeline's Inkscape/CairoSVG path)
    handle this correctly. V1.5+ may switch to a fully native SVG generator
    if foreignObject support is uneven.
    """
    html_body = render_panel_html(panel)
    width_mm = 73
    height_mm = 110  # approximate; auto-grows in foreignObject
    svg_attrs = (
        f'xmlns="http://www.w3.org/2000/svg" '
        f'width="{width_mm}mm" height="{height_mm}mm" '
        f'viewBox="0 0 280 420"'
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg {svg_attrs}>
  <foreignObject x="0" y="0" width="280" height="420">
    <div xmlns="http://www.w3.org/1999/xhtml">{html_body}</div>
  </foreignObject>
</svg>
"""
