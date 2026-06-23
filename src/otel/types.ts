/**
 * Minimal OTLP JSON types for trace export.
 *
 * Shapes follow OTLP/HTTP JSON Protobuf encoding (lowerCamelCase field names).
 * @see https://opentelemetry.io/docs/specs/otlp/
 */

export interface ExportTraceServiceRequest {
  resourceSpans: ResourceSpans[];
}

export interface ResourceSpans {
  resource: Resource;
  scopeSpans: ScopeSpans[];
}

export interface Resource {
  attributes: KeyValue[];
}

export interface ScopeSpans {
  scope: InstrumentationScope;
  spans: Span[];
}

export interface InstrumentationScope {
  name: string;
  version?: string;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: KeyValue[];
  status?: SpanStatus;
}

export interface SpanStatus {
  code: number;
  message?: string;
}

export interface KeyValue {
  key: string;
  value: AnyValue;
}

export interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string;
  doubleValue?: number;
  bytesValue?: string;
  arrayValue?: ArrayValue;
  kvlistValue?: KeyValueList;
}

export interface ArrayValue {
  values: AnyValue[];
}

export interface KeyValueList {
  values: KeyValue[];
}

/** OTLP span kinds (enum integers). */
export const SpanKind = {
  INTERNAL: 1,
  CLIENT: 2,
} as const;

/** OTLP status codes. */
export const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;

export interface EmitOtelOptions {
  /** User prompt for the first `gen_ai.input.messages` entry. */
  prompt?: string;
  /** `gen_ai.agent.name` on the root span. Default: `claude-code`. */
  agentName?: string;
  /** `gen_ai.provider.name`. Default: `anthropic`. */
  providerName?: string;
  /** Resource `service.name`. Default: `harness-eval`. */
  serviceName?: string;
  /** Instrumentation scope name. Default: `@alis-build/harness-eval`. */
  instrumentationScope?: string;
  /**
   * Wall-clock end time for the trace (ms). Defaults to `Date.now()`.
   * Start is derived from `view.usage.durationMs`.
   */
  endTimeMs?: number;
}
