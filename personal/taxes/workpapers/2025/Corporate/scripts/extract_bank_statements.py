#!/usr/bin/env python3
"""
Extract transaction data from BMO bank statement PDFs.
Parses transaction lines and saves to CSV.
"""

import os
import re
import csv
from pathlib import Path
import pdfplumber
from datetime import datetime


def extract_statement_month(filename):
    """Extract month from filename like '1-January 31, 2025.pdf'"""
    # Parse the month name from filename
    match = re.search(r'-(\w+)\s', filename)
    if match:
        month_name = match.group(1)
        # Extract the day and year
        date_match = re.search(r'(\d{1,2}),\s(\d{4})', filename)
        if date_match:
            day = date_match.group(1)
            year = date_match.group(2)
            return f"{month_name} {day}, {year}"
    return filename


def parse_transaction_line(line, statement_month):
    """
    Parse a transaction line like:
    Jan10 DirectDeposit,MIRSERVICESPAY/PAY 3,842.00 81,581.87

    Returns: dict with date, description, amount, type (debit/credit)
    """
    # Skip summary lines and headers
    if not line.strip() or 'Number of items' in line or 'Closing totals' in line:
        return None

    # Match transaction pattern: Date Description Amount Balance
    # Date is like Jan01, Jan10, etc.
    pattern = r'^([A-Z][a-z]{2})(\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$'

    match = re.match(pattern, line.strip())
    if not match:
        return None

    month_abbr, day, description, amount_str, balance_str = match.groups()

    # Skip opening/closing balance lines
    if 'opening balance' in description.lower() or 'closing' in description.lower():
        return None

    try:
        amount = float(amount_str.replace(',', ''))
        balance = float(balance_str.replace(',', ''))

        # Determine if debit or credit based on description keywords
        # Debits: purchases, transfers sent, withdrawals
        # Credits: direct deposits, transfers received
        description_lower = description.lower()

        if any(word in description_lower for word in ['transfer sent', 'debit card', 'payment', 'withdrawal']):
            trans_type = 'debit'
        elif any(word in description_lower for word in ['direct deposit', 'transfer received', 'credit']):
            trans_type = 'credit'
        else:
            # Default: if it's a typical debit/withdrawal pattern
            trans_type = 'debit'

        # Extract date - construct full date from month and day
        # Parse month from statement_month like "January 31, 2025"
        month_match = re.search(r'(\w+)\s+\d+,\s+(\d{4})', statement_month)
        if month_match:
            month_name = month_match.group(1)
            year = month_match.group(2)
            date_str = f"{month_abbr} {day}, {year}"
        else:
            date_str = f"{month_abbr} {day}"

        return {
            'statement_month': statement_month,
            'date': date_str,
            'description': description,
            'amount': amount,
            'type': trans_type
        }
    except (ValueError, AttributeError):
        return None


def extract_transactions_from_pdf(pdf_path):
    """
    Extract all transactions from a single PDF file.
    Returns list of transaction dicts.
    """
    transactions = []
    filename = os.path.basename(pdf_path)
    statement_month = extract_statement_month(filename)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Process all pages
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if not text:
                    continue

                # Split into lines
                lines = text.split('\n')

                # Find the "Transaction details" section
                transaction_start = False
                for i, line in enumerate(lines):
                    if 'Transaction details' in line or 'Amountsdebited' in line:
                        transaction_start = True
                        continue

                    if transaction_start:
                        # Parse transaction line
                        trans = parse_transaction_line(line, statement_month)
                        if trans:
                            transactions.append(trans)

    except Exception as e:
        print(f"Error processing {pdf_path}: {e}")

    return transactions


def main():
    """Main extraction and CSV writing function."""

    pdf_dir = Path("/sessions/jolly-affectionate-goodall/mnt/2025 taxes/business debit statements/")
    output_csv = Path("/sessions/jolly-affectionate-goodall/debit_statements_parsed.csv")

    # Collect all PDFs in order
    pdf_files = sorted(pdf_dir.glob("*.pdf"),
                      key=lambda x: int(x.stem.split('-')[0]))

    if not pdf_files:
        print(f"No PDF files found in {pdf_dir}")
        return

    print(f"Found {len(pdf_files)} PDF files")
    print("=" * 80)

    all_transactions = []

    # Process each PDF
    for pdf_file in pdf_files:
        print(f"\nProcessing: {pdf_file.name}")
        transactions = extract_transactions_from_pdf(str(pdf_file))

        if transactions:
            all_transactions.extend(transactions)
            print(f"  Extracted {len(transactions)} transactions")
            print(f"  Sample transactions:")
            for trans in transactions[:3]:
                print(f"    {trans['date']}: {trans['description'][:40]:40} | "
                      f"${trans['amount']:10.2f} ({trans['type']})")
            if len(transactions) > 3:
                print(f"    ... and {len(transactions) - 3} more")
        else:
            print(f"  No transactions found")

    print("\n" + "=" * 80)
    print(f"\nTotal transactions extracted: {len(all_transactions)}")

    # Write to CSV
    if all_transactions:
        csv_columns = ['statement_month', 'date', 'description', 'amount', 'type']

        try:
            with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
                writer.writeheader()
                writer.writerows(all_transactions)

            print(f"\nSuccessfully wrote {len(all_transactions)} transactions to:")
            print(f"  {output_csv}")

            # Print summary statistics
            print("\n" + "=" * 80)
            print("SUMMARY BY MONTH:")
            print("=" * 80)

            month_counts = {}
            month_debits = {}
            month_credits = {}

            for trans in all_transactions:
                month = trans['statement_month']
                amount = trans['amount']
                trans_type = trans['type']

                month_counts[month] = month_counts.get(month, 0) + 1

                if trans_type == 'debit':
                    month_debits[month] = month_debits.get(month, 0) + amount
                else:
                    month_credits[month] = month_credits.get(month, 0) + amount

            for month in sorted(month_counts.keys(), key=lambda x: int(x.split()[2])):
                count = month_counts[month]
                debits = month_debits.get(month, 0)
                credits = month_credits.get(month, 0)
                print(f"{month:25} | Count: {count:3} | Debits: ${debits:12,.2f} | Credits: ${credits:12,.2f}")

        except Exception as e:
            print(f"Error writing CSV: {e}")
    else:
        print("\nNo transactions found to write to CSV")


if __name__ == "__main__":
    main()
