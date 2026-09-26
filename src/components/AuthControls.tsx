import { SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'

/** Sign-in/sign-up when signed out, a user button when signed in. Renders nothing until Clerk loads. */
export function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return null

  if (isSignedIn) return <UserButton />

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <SignInButton mode="modal" />
      <SignUpButton mode="modal" />
    </div>
  )
}
