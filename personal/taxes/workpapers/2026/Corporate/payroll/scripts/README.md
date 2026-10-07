# 2026 Payroll Scripts

## `calc_2026.py`
Pure calculator. Run it to print per-month + annual figures for both schedules:
- April–December (9 months @ $2,666.67/mo)  ← **the active plan**
- May–December (8 months @ $3,000/mo)       ← alternative for comparison

```bash
python3 calc_2026.py
```

All 2026 CRA values (federal 14% rate, BPA $16,452, Ontario BPA $12,989, CPP 5.95% / $3,500 exemption, OHP) are hard-coded near the top of the file. Update them when CRA publishes 2027 values.

## `build_cpp_pdf.py`
Generates both PDFs into `Taxes/2026/Corporate/payroll/`:
- `CPP.pdf` — original 12-month $2K/mo plan (preserved for reference)
- `CPP_24K_Apr-Dec.pdf` — active 9-month $2,666.67/mo plan with payment + remittance schedules and a calculation-basis footnote

```bash
pip install reportlab --break-system-packages
python3 build_cpp_pdf.py
```

If you change any constant in `calc_2026.py`, copy the new figures into the corresponding `build_pdf(...)` call in `build_cpp_pdf.py` (or refactor to import directly). The two scripts are intentionally decoupled so the PDF script can run without dependencies on the calculator.

## Common edits

| Change | Where to edit in `build_cpp_pdf.py` |
|---|---|
| Switch from April–Dec to May–Dec | Replace `APR_DEC = [...]` with the May–Dec list and update `salary=`, `cpp=`, `tax=` from `calc_2026.py`'s May–Dec output |
| Switch from true-up to annualized | Recompute tax with `monthly_gross × 12` as `annual_gross` in `calc_2026.py`, copy new monthly tax in |
| Change pay date from month-end to e.g. 15th | Edit `PAY_DATES` list |
| New 2027 calendar | Replace `2026` strings throughout |
