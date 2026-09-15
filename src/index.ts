/** The core has no framework, cache, transport, or application dependencies. */
export { createMutationJournal, type MutationJournal } from './journal'
export { createMutationRegistry } from './registry'
export { createScopedJournalRegistry, type ScopedJournalRegistry } from './scopes'
export {
  createStorageRecoveryStore,
  createOfflineDraft,
  replayOfflineDraft,
  recoverPersistedOperations,
  saveRecoveryOperation,
  type MutationStatus,
  type OfflineDraft,
  type RecoveryStore,
  type StorageLike,
} from './persistence'
export {
  createBrowserCoordinator,
  type BrowserCoordinator,
  type BroadcastChannelLike,
  type LockManagerLike,
} from './browser'
export {
  CAUSYNC_MANIFEST_VERSION,
  createContractManifest,
  describeContract,
  parseContractManifest,
  type ContractEvidenceDescription,
  type ContractManifest,
  type ContractManifestEntry,
  type ContractManifestMetadata,
} from './manifest'
export { createCausyncContract } from './contract'
export {
  ContractSchemaError,
  validateContractInput,
  validateContractReceipt,
  type StandardSchemaIssue,
  type StandardSchemaResult,
  type StandardSchemaV1,
} from './schema'
export {
  CAUSYNC_RECOVERY_VERSION,
  isJsonValue,
  parseRecoveryOperation,
  serializeRecoveryOperation,
  type JsonValue,
  type RecoveryOperation,
} from './recovery'
export {
  CAUSYNC_CORE_CAPABILITIES,
  MutationFailure,
  MutationSuperseded,
  type Contract,
  type FailureKind,
  type Operation,
  type OfflinePolicy,
  type Phase,
  type RepeatedInput,
  type RetryPolicy,
  type Strategy,
  type TransitionMetadata,
} from './types'
