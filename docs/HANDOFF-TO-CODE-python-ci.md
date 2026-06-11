# Handoff to Code — fix the Python CI job (Ruff · Mypy · Pytest)

The `python-checks` job in `.github/workflows/ci.yml` has failed since day one
(exit 1). Cowork can't run the Python toolchain (no PyPI access in its sandbox),
so handing the fix to Code, which can `pip install` + run the tools and verify.

## What CI runs (`services/compliance`, working-directory)

```yaml
- pip install -e ".[dev]"      # Install
- ruff check .                 # Ruff
- mypy app                     # Mypy  (pyproject: [tool.mypy] strict = true)
- pytest                       # Pytest (asyncio_mode = auto, testpaths = ["tests"])
```
Ruff select = `E, F, I, W, B, UP`, line-length 100, target py311. CI Python = 3.12.

## Already diagnosed (verifiable, via stdlib — no tools needed)

- **All `app/*.py` + `tests/*.py` compile** (`python -m py_compile`) — no syntax errors.
- **Zero unused imports** (ast scan) — so the failure is NOT trivial dead-import rot.
- Therefore the red X is almost certainly one (or more) of:
  1. **Mypy `strict = true`** — the most likely culprit. Strict mypy on a FastAPI +
     prisma + weasyprint codebase usually flags missing annotations, `Any` returns,
     untyped-decorator/3rd-party issues. (`weasyprint` is already `# type: ignore`'d
     in `app/label_render.py`.)
  2. **Pytest import of WeasyPrint** — `app/label_render.py` does `from weasyprint import HTML`
     at module top. WeasyPrint needs native Pango/Cairo libs at import time, and the
     job has **no system-deps step**. If any test imports `app.main`/`label_render`,
     pytest dies at collection with an ImportError.
  3. Minor **ruff B/UP** nits (bugbear / pyupgrade) — run to confirm.

## Recommended fix order (run + verify each — you have the tools)

1. **Add WeasyPrint system deps** to the `python-checks` job in `.github/workflows/ci.yml`,
   right after `actions/setup-python` and before `Install`:
   ```yaml
   - name: System deps (WeasyPrint)
     run: sudo apt-get update && sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libcairo2 libffi-dev
   ```
2. `cd services/compliance && pip install -e ".[dev]"`
3. `ruff check . --fix` — auto-fix mechanical issues, eyeball the rest.
4. `mypy app` — fix the real annotation gaps. **Decision for Pavel:** if `strict = true`
   is more pain than it's worth for this young service, relax it (drop `strict = true`,
   or scope per-module `[[tool.mypy.overrides]] ignore_missing_imports = true` for
   `weasyprint.*` / `prisma.*`). Don't loosen blindly — fix what's cheap, relax what isn't.
5. `pytest` — fix or skip genuinely-broken tests; confirm green.

## Don't touch

- The four `apps/*/.eslintrc.json` + the `SubscribeChoiceRail.tsx` inline disable —
  that's the **Node lint** fix (separate, already green, see `ilaunchify-ci-lint-setup`).
- The `prisma-migration-safety` / `db-migrate` workflows are a separate failure
  (consequence of the `db push` dev workflow — no migration files). Not this job.

## Acceptance

`cd services/compliance && ruff check . && mypy app && pytest` all exit 0, and the
GitHub `Python · Ruff · Mypy · Pytest` check goes green.
