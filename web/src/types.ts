export type TxType = 'income' | 'expense'

export interface CategoryGroup {
  name: string
  items: string[]
}

export interface Categories {
  year: number | null
  income: CategoryGroup[]
  expense: CategoryGroup[]
}

export interface Amounts {
  name: string
  plan: number
  actual: number
}

export interface MonthGroup extends Amounts {
  items: Amounts[]
}

export interface MonthSummary {
  plannedIncome: number | null
  plannedExpense: number | null
  income: number | null
  expense: number | null
  left: number | null
  daysLeft: number | null
  perDay: number | null
}

export interface MonthData {
  month: number
  year: number | null
  summary: MonthSummary
  income: MonthGroup[]
  expense: MonthGroup[]
}

export interface Tx {
  clientId: string
  type: TxType
  group: string
  category: string
  amount: number
  date: string
  note: string
  person: string
}

export interface LogEntry extends Tx {
  savedAt: string
  status: string
}

export interface PendingTx extends Tx {
  error?: string
}

export interface Account {
  name: string
  value: number | null
  prev: number | null
}

export interface AccountsData {
  month: number
  assets: Account[]
  debts: Account[]
}

export interface Settings {
  url: string
  token: string
  person: string
}
