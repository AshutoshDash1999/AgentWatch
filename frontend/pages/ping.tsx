export default function Ping() {
  return <pre style={{ fontFamily: 'monospace', padding: 32 }}>AgentWatch OK — {new Date().toISOString()}</pre>
}
