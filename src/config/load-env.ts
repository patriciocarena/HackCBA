try {
  process.loadEnvFile()
} catch {
  // No .env file. Fly provides the environment.
}
