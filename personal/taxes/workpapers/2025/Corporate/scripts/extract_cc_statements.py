#!/usr/bin/env python3
"""
Extract transaction data from BMO credit card statement PDFs.
Parses all 12 monthly statements and saves transactions to CSV.
"""

import pdfplumber
import csv
import re
import os
from pathlib import Path
from datetime import datetime

def extract_month_from_filename(filename):
    """Extract month number and date from filename like '01-January 28, 2025-min.pdf'"""
    match = re.match(r'(\d+)-(\w+)', filename)
    if match:
        month_num = match.group(1)
        month_name = match.group(2)
        return month_num, month_name
    return None, None

def parse_amount(amount_str):
    """Convert amount string to float, handling CR (credit) notation"""
    if not amount_str or not amount_str.strip():
        return 0.0

    # Remove spaces and check for CR (credit) indicator
    is_credit = 'CR' in amount_str.upper()

    # Extract just the number part
    amount_match = re.search(r'[\d,]+\.?\d*', amount_str)
    if amount_match:
        amount = float(amount_match.group().replace(',', ''))
        # Negate if it's a credit
        return -amount if is_credit else amount
    return 0.0

def extract_transactions_from_pdf(pdf_path, statement_month):
    """
    Extract all transactions from a credit card statement PDF.
    Returns a list of transaction dictionaries.
    """
    transactions = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Transactions are typically on the last page(s)
            for page in pdf.pages:
                text = page.extract_text()
                if text and 'Transactions since your last statement' in text:
                    # Parse the transactions from this page
                    lines = text.split('\n')

                    # Find the start of transactions
                    trans_start = False
                    i = 0
                    while i < len(lines):
                        line = lines[i].strip()

                        # Skip header lines
                        if 'Transactions since your last statement' in line:
                            trans_start = True
                            i += 1
                            continue

                        if not trans_start:
                            i += 1
                            continue

                        # Stop at summary lines
                        if any(keyword in line for keyword in ['Subtotal for', 'Total for card', 'Page', 'CREDIT CARD CONTROL INFORMATION']):
                            break

                        # Skip header lines with column names
                        if any(col in line for col in ['TRANS DATE', 'POSTING', 'DESCRIPTION', 'AMOUNT']):
                            i += 1
                            continue

                        # Skip lines that are just 'Card number:' or similar metadata
                        if any(skip in line for skip in ['Card number:', 'MR UMAR', 'XXXX', 'www.amazon']):
                            if 'XXXX XXXX XXXX' in line or 'MR UMAR FAROOQ' in line:
                                i += 1
                                continue

                        # Try to parse a transaction line
                        # Format: DATE DATE DESCRIPTION AMOUNT
                        # Some descriptions span multiple lines

                        # Check if line starts with a date pattern (e.g., "Dec. 27" or "Jan. 1")
                        date_pattern = r'^([A-Z][a-z]+\.?\s+\d+)'

                        if re.match(date_pattern, line):
                            parts = line.split()

                            # Need at least: TRANS_DATE POSTING_DATE DESCRIPTION AMOUNT
                            if len(parts) >= 4:
                                trans_date = f"{parts[0]} {parts[1]}"  # e.g., "Dec. 27"
                                posting_date = f"{parts[2]} {parts[3]}"  # e.g., "Dec. 30"

                                # Everything else is description + amount
                                rest = ' '.join(parts[4:])

                                # Find the amount (last number possibly with CR)
                                amount_match = re.search(r'([\d,]+\.?\d*(?:\s+CR)?)\s*$', rest)
                                if amount_match:
                                    amount_str = amount_match.group(1)
                                    description = rest[:amount_match.start()].strip()

                                    # Clean up description
                                    description = re.sub(r'\s+', ' ', description).strip()

                                    amount = parse_amount(amount_str)

                                    transactions.append({
                                        'statement_month': statement_month,
                                        'trans_date': trans_date,
                                        'posting_date': posting_date,
                                        'description': description,
                                        'amount': amount,
                                        'amount_str': amount_str
                                    })

                        i += 1

    except Exception as e:
        print(f"Error processing {pdf_path}: {e}")

    return transactions

def main():
    pdf_dir = Path("/sessions/jolly-affectionate-goodall/mnt/2025 taxes/Business credit card statements")
    output_csv = Path("/sessions/jolly-affectionate-goodall/cc_statements_parsed.csv")

    if not pdf_dir.exists():
        print(f"Error: Directory not found: {pdf_dir}")
        return

    # Find all PDFs sorted by filename
    pdf_files = sorted(pdf_dir.glob("*.pdf"))

    if not pdf_files:
        print(f"Error: No PDF files found in {pdf_dir}")
        return

    print(f"Found {len(pdf_files)} PDF files")
    print("="*80)

    all_transactions = []

    # Process each PDF
    for pdf_file in pdf_files:
        month_num, month_name = extract_month_from_filename(pdf_file.name)

        if not month_num:
            print(f"Warning: Could not parse month from {pdf_file.name}")
            continue

        statement_month = f"{month_num}-{month_name}"
        print(f"\nProcessing {pdf_file.name} ({statement_month})...")

        transactions = extract_transactions_from_pdf(str(pdf_file), statement_month)

        print(f"  Extracted {len(transactions)} transactions")

        # Show sample transactions
        if transactions:
            print(f"  Sample transactions:")
            for tx in transactions[:3]:
                print(f"    {tx['trans_date']} | {tx['description'][:40]:40s} | ${tx['amount']:>8.2f}")
            if len(transactions) > 3:
                print(f"    ... and {len(transactions)-3} more")

        all_transactions.extend(transactions)

    print("\n" + "="*80)
    print(f"Total transactions extracted: {len(all_transactions)}")

    # Write to CSV
    if all_transactions:
        with open(output_csv, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['statement_month', 'trans_date', 'posting_date', 'description', 'amount']
            writer = csv.DictWriter(f, fieldnames=fieldnames)

            writer.writeheader()
            for tx in all_transactions:
                writer.writerow({
                    'statement_month': tx['statement_month'],
                    'trans_date': tx['trans_date'],
                    'posting_date': tx['posting_date'],
                    'description': tx['description'],
                    'amount': f"{tx['amount']:.2f}"
                })

        print(f"\nCSV saved to: {output_csv}")
        print(f"Total rows written: {len(all_transactions)}")

        # Show summary statistics
        print("\n" + "="*80)
        print("SUMMARY BY MONTH:")
        print("="*80)

        month_totals = {}
        for tx in all_transactions:
            month = tx['statement_month']
            if month not in month_totals:
                month_totals[month] = 0
            month_totals[month] += tx['amount']

        for month in sorted(month_totals.keys()):
            total = month_totals[month]
            print(f"{month:20s}: ${total:>10.2f}")

        overall_total = sum(month_totals.values())
        print("-" * 40)
        print(f"{'TOTAL':20s}: ${overall_total:>10.2f}")

    else:
        print("Error: No transactions extracted from any PDFs")

if __name__ == "__main__":
    main()
