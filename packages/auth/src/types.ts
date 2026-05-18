export type Role = 'ADMIN' | 'CREATOR' | 'PARTNER'

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
