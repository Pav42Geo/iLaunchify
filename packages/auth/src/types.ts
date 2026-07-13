// DESIGNER added 2026-07-13 (Shared Design Workspace D-W1): invited packaging
// designer — a minimal account. Every requireRole allow-list stays explicit,
// so DESIGNER is excluded from all existing surfaces by default (the scope
// wall); only the design-invite + room-Studio routes admit it.
export type Role = 'ADMIN' | 'CREATOR' | 'PARTNER' | 'DESIGNER'

export interface User {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: Role
}

export interface Session {
  user: User
  expires: string
}
