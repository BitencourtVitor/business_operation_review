import { trace, type TraceInput } from "./trace"

self.onmessage = (event: MessageEvent<TraceInput>) => {
  ;(self as unknown as Worker).postMessage(trace(event.data))
}
