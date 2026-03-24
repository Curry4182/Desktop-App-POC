import 'dotenv/config'

export async function createTracer() {
  if (!process.env.LANGFUSE_SECRET_KEY) return null
  try {
    const { CallbackHandler } = await import('langfuse-langchain')
    return new CallbackHandler({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    })
  } catch {
    return null
  }
}
