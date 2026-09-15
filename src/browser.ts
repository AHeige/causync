export type BroadcastChannelLike = Readonly<{
  postMessage(value: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  close(): void
}>

export type LockManagerLike = Readonly<{
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}>

export type BrowserCoordinator = Readonly<{
  publish(mutationId: string): void
  subscribe(listener: (mutationId: string) => void): () => void
  runExclusive<T>(resource: string, action: () => Promise<T>): Promise<T>
  close(): void
}>

/** Coordinates status refresh and optional exclusive sends inside one browser profile. */
export function createBrowserCoordinator(options: {
  scope: string
  channel: BroadcastChannelLike
  locks?: LockManagerLike
}): BrowserCoordinator {
  if (!options.scope.trim()) throw new Error('Causync browser scope is required')
  const listeners = new Set<(mutationId: string) => void>()
  const receive = (event: MessageEvent) => {
    const value = event.data
    if (
      typeof value === 'object' && value !== null &&
      'scope' in value && value.scope === options.scope &&
      'mutationId' in value && typeof value.mutationId === 'string'
    ) for (const listener of listeners) listener(value.mutationId)
  }
  options.channel.addEventListener('message', receive)
  return Object.freeze({
    publish(mutationId) { options.channel.postMessage({ scope: options.scope, mutationId }) },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    runExclusive(resource, action) {
      if (!options.locks) {
        throw new Error('Exclusive multi-tab sends require a host LockManager')
      }
      return options.locks.request(`causync:${options.scope}:${resource}`, action)
    },
    close() {
      options.channel.removeEventListener('message', receive)
      options.channel.close()
      listeners.clear()
    },
  })
}
