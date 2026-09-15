export type StandardSchemaIssue = Readonly<{
  message: string
  path?: ReadonlyArray<PropertyKey | Readonly<{ key: PropertyKey }>>
}>

export type StandardSchemaResult<T> =
  | Readonly<{ value: T; issues?: undefined }>
  | Readonly<{ issues: readonly StandardSchemaIssue[] }>

/** Dependency-free subset of the Standard Schema v1 contract. */
export type StandardSchemaV1<T> = Readonly<{
  '~standard': Readonly<{
    version: 1
    vendor: string
    validate(value: unknown): StandardSchemaResult<T> | Promise<StandardSchemaResult<T>>
  }>
}>

export class ContractSchemaError extends Error {
  readonly issues: readonly StandardSchemaIssue[]

  constructor(boundary: 'input' | 'receipt', issues: readonly StandardSchemaIssue[]) {
    const details = issues.slice(0, 3).map(issue => issue.message).join('; ')
    super(`Causync contract ${boundary} validation failed${details ? `: ${details}` : ''}`)
    this.name = 'ContractSchemaError'
    this.issues = issues
  }
}

function isPromise<T>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof value === 'object' && 'then' in value)
}

export function validateContractInput<T>(schema: StandardSchemaV1<T>, value: unknown): T {
  const result = schema['~standard'].validate(value)
  if (isPromise<StandardSchemaResult<T>>(result)) {
    throw new Error('Causync input schemas must validate synchronously')
  }
  if (result.issues) throw new ContractSchemaError('input', result.issues)
  return result.value
}

export async function validateContractReceipt<T>(schema: StandardSchemaV1<T>, value: unknown): Promise<T> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) throw new ContractSchemaError('receipt', result.issues)
  return result.value
}
