import { get, set } from 'idb-keyval'

/** Small offline cache for read responses (categories, month, accounts). */
export async function cached<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>('cache:' + key)
  } catch {
    return undefined
  }
}

export async function store<T>(key: string, value: T): Promise<void> {
  try {
    await set('cache:' + key, value)
  } catch {
    // ignore
  }
}
