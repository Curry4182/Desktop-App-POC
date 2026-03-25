import 'dotenv/config'

function isTracingConfigured(): boolean {
  return false
}

export async function createTracer() {
  // Langfuse evals are run explicitly through experiment.run().
  // Detailed trace export requires OpenTelemetry setup, so keep the
  // default runtime tracer disabled until that is configured.
  if (!isTracingConfigured()) {
    return null
  }

  return null
}
