declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: string): string
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string
  export function join(...segments: string[]): string
}
