export interface NavItem {
  key: string;
  labelKey: string;
  path: string;
  descriptionKey: string;
  requiresBookset?: boolean;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavItem[];
}

export interface NavSection {
  key: string;
  labelKey: string;
  groups: NavGroup[];
}

export const navSections: NavSection[] = [
  {
    key: "voucher",
    labelKey: "nav.section.voucher",
    groups: [
      {
        key: "voucher-management",
        labelKey: "nav.group.voucherManagement",
        items: [
          { key: "voucher-fill", labelKey: "nav.item.voucherFill", path: "/app/voucher/fill", descriptionKey: "nav.desc.voucherFill", requiresBookset: true },
          { key: "voucher-query", labelKey: "nav.item.voucherQuery", path: "/app/voucher/query", descriptionKey: "nav.desc.voucherQuery", requiresBookset: true }
        ]
      },
      {
        key: "bookkeeping",
        labelKey: "nav.group.bookkeeping",
        items: [
          { key: "bookkeeping-run", labelKey: "nav.item.bookkeepingRun", path: "/app/period-end/bookkeeping", descriptionKey: "nav.desc.bookkeepingRun", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "ledger",
    labelKey: "nav.section.ledger",
    groups: [
      {
        key: "ledger-accounts",
        labelKey: "nav.group.ledgerAccounts",
        items: [
          { key: "ledger-account-list", labelKey: "nav.item.ledgerAccountList", path: "/app/ledger/accounts", descriptionKey: "nav.desc.ledgerAccountList", requiresBookset: true }
        ]
      },
      {
        key: "ledger-books",
        labelKey: "nav.group.ledgerBooks",
        items: [
          { key: "ledger-general", labelKey: "nav.item.ledgerGeneral", path: "/app/ledger/general", descriptionKey: "nav.desc.ledgerGeneral", requiresBookset: true },
          { key: "ledger-subsidiary", labelKey: "nav.item.ledgerSubsidiary", path: "/app/ledger/subsidiary", descriptionKey: "nav.desc.ledgerSubsidiary", requiresBookset: true },
          { key: "ledger-journal", labelKey: "nav.item.ledgerJournal", path: "/app/ledger/journal", descriptionKey: "nav.desc.ledgerJournal", requiresBookset: true },
          { key: "ledger-trial-balance", labelKey: "nav.item.ledgerTrialBalance", path: "/app/ledger/trial-balance", descriptionKey: "nav.desc.ledgerTrialBalance", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "contacts",
    labelKey: "nav.section.contacts",
    groups: [
      {
        key: "contacts-ar",
        labelKey: "nav.group.contactsArAp",
        items: [
          { key: "contacts-ar", labelKey: "nav.item.contactsAr", path: "/app/contacts/ar", descriptionKey: "nav.desc.contactsAr", requiresBookset: true },
          { key: "contacts-ap", labelKey: "nav.item.contactsAp", path: "/app/contacts/ap", descriptionKey: "nav.desc.contactsAp", requiresBookset: true },
          { key: "contacts-writeoff", labelKey: "nav.item.contactsWriteoff", path: "/app/contacts/writeoff", descriptionKey: "nav.desc.contactsWriteoff", requiresBookset: true },
          { key: "contacts-aging", labelKey: "nav.item.contactsAging", path: "/app/contacts/aging", descriptionKey: "nav.desc.contactsAging", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "cashier",
    labelKey: "nav.section.cashier",
    groups: [
      {
        key: "cashier-daily",
        labelKey: "nav.group.cashierDaily",
        items: [
          { key: "cashier-cash-journal", labelKey: "nav.item.cashierCashJournal", path: "/app/cashier/cash-journal", descriptionKey: "nav.desc.cashierCashJournal", requiresBookset: true },
          { key: "cashier-bank-journal", labelKey: "nav.item.cashierBankJournal", path: "/app/cashier/bank-journal", descriptionKey: "nav.desc.cashierBankJournal", requiresBookset: true },
          { key: "cashier-bank-reconcile", labelKey: "nav.item.cashierBankReconcile", path: "/app/cashier/bank-reconcile", descriptionKey: "nav.desc.cashierBankReconcile", requiresBookset: true },
          { key: "cashier-balance-sheet", labelKey: "nav.item.cashierBalanceSheet", path: "/app/cashier/balance-sheet", descriptionKey: "nav.desc.cashierBalanceSheet", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "period-end",
    labelKey: "nav.section.periodEnd",
    groups: [
      {
        key: "period-end-process",
        labelKey: "nav.group.periodEndProcess",
        items: [
          { key: "bookkeeping-carry-custom", labelKey: "nav.item.bookkeepingCarryCustom", path: "/app/period-end/carry-custom", descriptionKey: "nav.desc.bookkeepingCarryCustom", requiresBookset: true },
          { key: "bookkeeping-carry-cogs", labelKey: "nav.item.bookkeepingCarryCogs", path: "/app/period-end/carry-cogs", descriptionKey: "nav.desc.bookkeepingCarryCogs", requiresBookset: true },
          { key: "bookkeeping-carry-pl", labelKey: "nav.item.bookkeepingCarryPl", path: "/app/period-end/carry-pl", descriptionKey: "nav.desc.bookkeepingCarryPl", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "report-forms",
    labelKey: "nav.section.reportForms",
    groups: [
      {
        key: "report-core",
        labelKey: "nav.group.reportCore",
        items: [
          { key: "report-generate", labelKey: "nav.item.reportGenerate", path: "/app/reports/generate", descriptionKey: "nav.desc.reportGenerate", requiresBookset: true },
          { key: "report-query", labelKey: "nav.item.reportQuery", path: "/app/reports/query", descriptionKey: "nav.desc.reportQuery", requiresBookset: true },
          { key: "report-balance-sheet", labelKey: "nav.item.reportBalanceSheet", path: "/app/reports/balance-sheet", descriptionKey: "nav.desc.reportBalanceSheet", requiresBookset: true },
          { key: "report-income", labelKey: "nav.item.reportIncome", path: "/app/reports/income", descriptionKey: "nav.desc.reportIncome", requiresBookset: true },
          { key: "report-cashflow", labelKey: "nav.item.reportCashflow", path: "/app/reports/cashflow", descriptionKey: "nav.desc.reportCashflow", requiresBookset: true }
        ]
      }
    ]
  },
  {
    key: "settings",
    labelKey: "nav.section.settings",
    groups: [
      {
        key: "settings-master-data",
        labelKey: "nav.group.settingsMasterData",
        items: [
          { key: "settings-bookset", labelKey: "nav.item.settingsBookset", path: "/app/settings/bookset", descriptionKey: "nav.desc.settingsBookset" }
        ]
      }
    ]
  }
];

export const allNavItems: NavItem[] = navSections.flatMap((section) =>
  section.groups.flatMap((group) => group.items)
);
