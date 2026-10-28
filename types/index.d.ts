export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = {
  limits: Limit[]
  contextPercent?: number
  costUsd?: number
}
// The main thread's last response: when it landed and how its input split across the prompt cache.
export type Cache = { at: number; read: number; write: number; input: number; ttl: '5m' | '1h' }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { usage: Shaped<Usage>; cache: Shaped<Cache | null> }
  }
}
