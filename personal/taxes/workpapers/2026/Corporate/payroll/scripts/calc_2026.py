"""
Rigorous 2026 Canadian payroll calculation for Maham Amir.
Ontario, Claim Code 1, EI exempt (non-arm's length spouse of controlling shareholder).
True-up method: tax withholding based on ACTUAL annual income of $24,000
(not annualized $36,000 from $3,000/month projection).
"""

# === 2026 OFFICIAL VALUES (from CRA / Government of Canada announcements) ===
FED_LOW_RATE  = 0.14          # 2026 lowest federal rate (dropped from 15% in 2025)
FED_BPA       = 16_452.00     # 2026 federal Basic Personal Amount (full, income < $181,440)
ON_LOW_RATE   = 0.0505        # 2026 Ontario lowest rate
ON_BPA        = 12_989.00     # 2026 Ontario BPA (indexed 1.9%)
CPP_RATE      = 0.0595        # 2026 base + enhanced CPP employee rate
CPP_YBE       = 3_500.00      # Yearly Basic Exemption (unchanged)
CPP_PERIOD_EXEMPTION = CPP_YBE / 12  # monthly pay period exemption
CPP_ENHANCED_RATIO   = 1/5.95
CPP_BASE_RATIO       = 4.95/5.95

def ohp(taxable_income):
    """Ontario Health Premium 2026 (unchanged structure)."""
    ti = taxable_income
    if ti <= 20_000:        return 0.0
    if ti <= 25_000:        return min(300.0, 0.06 * (ti - 20_000))
    if ti <= 36_000:        return 300.0
    if ti <= 38_500:        return min(450.0, 300.0 + 0.06 * (ti - 36_000))
    if ti <= 48_000:        return 450.0
    if ti <= 48_600:        return min(600.0, 450.0 + 0.25 * (ti - 48_000))
    if ti <= 72_000:        return 600.0
    if ti <= 72_600:        return min(750.0, 600.0 + 0.25 * (ti - 72_000))
    if ti <= 200_000:       return 750.0
    if ti <= 200_600:       return min(900.0, 750.0 + 0.25 * (ti - 200_000))
    return 900.0


def calc(annual_gross, months_paid, monthly_gross):
    # CPP using per-pay-period method (CRA standard)
    cpp_per_month = round((monthly_gross - CPP_PERIOD_EXEMPTION) * CPP_RATE, 2)
    annual_cpp    = round(cpp_per_month * months_paid, 2)
    cpp_enhanced  = annual_cpp * CPP_ENHANCED_RATIO     # tax-deductible portion
    cpp_base      = annual_cpp * CPP_BASE_RATIO         # gives non-refundable credit

    # ---- Federal tax (true-up using actual annual income) ----
    fed_taxable = annual_gross - cpp_enhanced
    fed_gross_tax = FED_LOW_RATE * fed_taxable
    fed_bpa_credit = FED_LOW_RATE * FED_BPA
    fed_cpp_credit = FED_LOW_RATE * cpp_base
    fed_tax = max(0.0, fed_gross_tax - fed_bpa_credit - fed_cpp_credit)

    # ---- Ontario tax (true-up) ----
    on_taxable = fed_taxable
    on_gross_tax = ON_LOW_RATE * on_taxable
    on_bpa_credit = ON_LOW_RATE * ON_BPA
    on_cpp_credit = ON_LOW_RATE * cpp_base
    on_basic_tax = max(0.0, on_gross_tax - on_bpa_credit - on_cpp_credit)
    # surtax 0 at this income level (kicks in at Ontario tax > $5,710)
    on_health_premium = ohp(on_taxable)
    on_tax_total = on_basic_tax + on_health_premium

    annual_tax = fed_tax + on_tax_total
    tax_per_month = round(annual_tax / months_paid, 2)

    # Build per-month figures
    td_per_month  = round(cpp_per_month + tax_per_month, 2)
    net_per_month = round(monthly_gross - td_per_month, 2)
    emp_cpp       = cpp_per_month
    cra_per_month = round(td_per_month + emp_cpp, 2)

    return dict(
        cpp_per_month=cpp_per_month, annual_cpp=annual_cpp,
        cpp_base=round(cpp_base,2), cpp_enhanced=round(cpp_enhanced,2),
        fed_taxable=round(fed_taxable,2),
        fed_tax=round(fed_tax,2),
        on_basic_tax=round(on_basic_tax,2),
        ohp=round(on_health_premium,2),
        on_tax_total=round(on_tax_total,2),
        annual_tax=round(annual_tax,2),
        tax_per_month=tax_per_month,
        td_per_month=td_per_month, net_per_month=net_per_month,
        emp_cpp=emp_cpp, cra_per_month=cra_per_month,
    )


print("=" * 66)
print("APRIL–DECEMBER (9 months @ $2,666.67/mo)")
print("=" * 66)
r = calc(annual_gross=24_000.00, months_paid=9, monthly_gross=2_666.67)
for k, v in r.items():
    print(f"  {k:18s} = {v}")
print("  ANNUAL totals:")
print(f"    salary           = {2666.67*9:.2f}")
print(f"    employee CPP     = {r['cpp_per_month']*9:.2f}")
print(f"    tax              = {r['tax_per_month']*9:.2f}")
print(f"    deductions       = {r['td_per_month']*9:.2f}")
print(f"    net pay          = {r['net_per_month']*9:.2f}")
print(f"    employer CPP     = {r['emp_cpp']*9:.2f}")
print(f"    CRA remit total  = {r['cra_per_month']*9:.2f}")

print()
print("=" * 66)
print("MAY–DECEMBER (8 months @ $3,000/mo) — for comparison")
print("=" * 66)
r2 = calc(annual_gross=24_000.00, months_paid=8, monthly_gross=3_000.00)
for k, v in r2.items():
    print(f"  {k:18s} = {v}")
print("  ANNUAL totals:")
print(f"    salary           = {3000.00*8:.2f}")
print(f"    employee CPP     = {r2['cpp_per_month']*8:.2f}")
print(f"    tax              = {r2['tax_per_month']*8:.2f}")
print(f"    deductions       = {r2['td_per_month']*8:.2f}")
print(f"    net pay          = {r2['net_per_month']*8:.2f}")
print(f"    employer CPP     = {r2['emp_cpp']*8:.2f}")
print(f"    CRA remit total  = {r2['cra_per_month']*8:.2f}")
