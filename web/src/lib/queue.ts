import { get, set } from 'idb-keyval'
import type { PendingTx, Tx } from '../types'
import { api, ApiError } from '../api/client'

const KEY = 'pending'
type Listener = (items: PendingTx[]) => void
const listeners = new Set<Listener>()
let flushing: Promise<FlushResult> | null = null

export interface FlushResult {
  sent: number
  failed: number
  offline: boolean
}

export async function pendingItems(): Promise<PendingTx[]> {
  return (await get<PendingTx[]>(KEY)) ?? []
}

async function save(items: PendingTx[]): Promise<void> {
  await set(KEY, items)
  listeners.forEach(l => l(items))
}

export function onQueueChange(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export async function enqueue(tx: Tx): Promise<void> {
  await save([...(await pendingItems()), tx])
}

export async function discard(clientId: string): Promise<void> {
  await save((await pendingItems()).filter(i => i.clientId !== clientId))
}

function stripError(item: PendingTx): Tx {
  const { error: _error, ...tx } = item
  return tx
}

/** Clears error flags so failed items are retried on the next flush. */
export async function resetErrors(): Promise<void> {
  await save((await pendingItems()).map(stripError))
}

/** Sends queued transactions one by one; stops at the first network failure. */
export function flush(): Promise<FlushResult> {
  if (!flushing) {
    flushing = doFlush().finally(() => { flushing = null })
  }
  return flushing
}

async function doFlush(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, offline: false }
  for (const item of await pendingItems()) {
    if (item.error) continue
    try {
      await api.add(stripError(item))
      await save((await pendingItems()).filter(i => i.clientId !== item.clientId))
      result.sent++
    } catch (e) {
      if (e instanceof ApiError) {
        await save((await pendingItems()).map(i => i.clientId === item.clientId ? { ...i, error: e.message } : i))
        result.failed++
      } else {
        result.offline = true
        break
      }
    }
  }
  return result
}
