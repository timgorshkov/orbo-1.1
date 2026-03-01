export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      const message = typeof args[0] === 'string' ? args[0] : ''
      // Suppress scanner-triggered "Failed to find Server Action" noise.
      // These originate from the ~5 second startup window before middleware
      // is initialized. After startup our middleware returns 400 for all
      // suspicious Next-Action header values so none reach the app.
      if (message.includes('Failed to find Server Action')) {
        return
      }
      originalConsoleError.apply(console, args)
    }
  }
}
