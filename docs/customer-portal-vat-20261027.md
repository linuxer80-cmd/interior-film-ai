# Customer settlement VAT

Customer pages previously displayed only the stored contract supply amount and treated it as the amount due. They now show supply amount, VAT at 10% rounded to won, and the total including VAT. For a 1,950,000 won contract these are 1,950,000 / 195,000 / 2,145,000 won.

Customer outstanding balances and paid-in-full notification eligibility use the gross total. Unconfirmed payments remain unknown; they are not treated as zero. Unapproved reports do not expose supply, VAT, total, payments, or account details.

The administrator receivables view also returns the gross payable amount under its existing `contract_amount` key so that full-payment entry, outstanding filters, and settlement totals agree with the customer page. New `supply_amount` and `vat_amount` columns support itemized display. The original stored `sites.contract_amount`, payment records, and net revenue/profit sources are not rewritten. Approved-report fallbacks without an explicit customer contract are preserved and never exposed as a customer contract.

Migrations:

- `20261027092300_customer_portal_vat_totals.sql`: strengthen the existing paid-in-full notification reservation check.
- `20261027092310_receivable_contract_vat_totals.sql`: update the security-invoker receivables view; preserve existing column order/types and grants.

Validation covers separate tax, partial/full payment, reversal, overpayment, unknown amounts, rounding, cross-company and voided entry exclusion, report-only fallbacks, no double tax on reapplication, and pre-approval data hiding. Existing notification templates and real message sends are unchanged by this update.
