'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  createMutationJournal,
  MutationFailure,
  type Contract,
  type Phase,
} from '@/packages/causync/src/index'
import { useMutationJournal } from '@/packages/causync/src/react'

type Scenario = 'rapid' | 'projection' | 'lost-response'
type TimelineEntry = { label: string; tone?: 'danger' | 'positive' | 'warning' }

const scenarios: Array<{ id: Scenario; label: string; summary: string }> = [
  { id: 'rapid', label: 'Rapid intent', summary: 'Complete → reopen → complete while one request is rejected.' },
  { id: 'projection', label: 'Projection lag', summary: 'The event is accepted before the read model catches up.' },
  { id: 'lost-response', label: 'Lost response', summary: 'The server commits, but its response never reaches the browser.' },
]

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function phaseLabel(phase: Phase | undefined) {
  if (!phase) return 'Ready'
  if (phase === 'pending') return 'Pending'
  if (phase === 'accepted') return 'Accepted · verifying evidence'
  if (phase === 'confirmed') return 'Confirmed'
  if (phase === 'superseded') return 'Superseded'
  if (phase === 'uncertain') return 'Needs attention'
  if (phase === 'conflict') return 'Conflict'
  return 'Rejected'
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className='mt-6 space-y-2 border-t border-border pt-5 font-mono text-[11px] leading-5'>
      {entries.length === 0 ? <li className='text-muted-foreground'>Run the fault to see the protocol.</li> : entries.map((entry, index) => (
        <li className={cn('flex gap-3', entry.tone === 'danger' && 'text-destructive', entry.tone === 'positive' && 'text-primary', entry.tone === 'warning' && 'text-amber-700 dark:text-amber-400', !entry.tone && 'text-muted-foreground')} key={`${index}-${entry.label}`}>
          <span className='w-5 shrink-0 text-muted-foreground/60'>{String(index + 1).padStart(2, '0')}</span>
          <span>{entry.label}</span>
        </li>
      ))}
    </ol>
  )
}

function Side({ children, description, title, withCausync = false }: { children: React.ReactNode; description: string; title: string; withCausync?: boolean }) {
  return (
    <article className={cn('py-8 lg:px-10 lg:py-10', withCausync ? 'lg:pr-0' : 'lg:pl-0')}>
      <p className={cn('text-xs font-semibold tracking-[0.2em] uppercase', withCausync ? 'text-primary' : 'text-muted-foreground')}>{title}</p>
      <p className='mt-2 min-h-12 max-w-xl text-sm leading-6 text-muted-foreground'>{description}</p>
      {children}
    </article>
  )
}

function ScenarioHeader({ disabled, onRun, onReset, runLabel }: { disabled: boolean; onRun: () => void; onReset: () => void; runLabel: string }) {
  return (
    <div className='flex flex-wrap items-center gap-3 border-b border-border pb-6'>
      <Button disabled={disabled} onClick={onRun} type='button'>{runLabel}</Button>
      <Button disabled={!disabled} onClick={onReset} type='button' variant='ghost'><RotateCcw /> Reset</Button>
      <p className='ml-auto text-xs text-muted-foreground'>Mock transport · no data leaves this page</p>
    </div>
  )
}

export function CausyncDemo() {
  const [scenario, setScenario] = useState<Scenario>('rapid')
  const [iteration, setIteration] = useState(0)
  const selected = scenarios.find(item => item.id === scenario) ?? scenarios[0]
  const reset = () => setIteration(value => value + 1)
  function select(next: Scenario) { setScenario(next); reset() }

  return (
    <div className='mt-10'>
      <div aria-label='Fault scenario' className='flex flex-wrap gap-x-7 gap-y-3 border-y border-border py-4' role='group'>
        {scenarios.map(item => (
          <button aria-pressed={scenario === item.id} className={cn('min-h-11 border-b-2 px-1 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', scenario === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')} key={item.id} onClick={() => select(item.id)} type='button'>
            {item.label}
          </button>
        ))}
      </div>
      <p className='py-5 text-sm leading-6 text-muted-foreground'>{selected.summary}</p>
      {scenario === 'rapid' ? <RapidIntentDemo key={`rapid-${iteration}`} onReset={reset} /> : null}
      {scenario === 'projection' ? <ProjectionLagDemo key={`projection-${iteration}`} onReset={reset} /> : null}
      {scenario === 'lost-response' ? <LostResponseDemo key={`lost-${iteration}`} onReset={reset} /> : null}
    </div>
  )
}

type RapidInput = { completed: boolean; step: 1 | 2 | 3 }
type RapidReceipt = { mutationId: string; completed: boolean; revision: number }

function RapidIntentDemo({ onReset }: { onReset: () => void }) {
  const [started, setStarted] = useState(false)
  const [baselineValue, setBaselineValue] = useState(false)
  const [baselineLog, setBaselineLog] = useState<TimelineEntry[]>([])
  const [causalBase, setCausalBase] = useState(false)
  const [causalLog, setCausalLog] = useState<TimelineEntry[]>([])
  const revision = useRef(0)
  const journal = useMemo(() => createMutationJournal<RapidInput, RapidReceipt>({
    id: (() => { let value = 0; return () => `rapid-${++value}` })(),
    onTransition: event => setCausalLog(log => [...log, { label: `${event.id} → ${event.phase}`, tone: event.phase === 'failed' ? 'danger' : event.phase === 'confirmed' ? 'positive' : undefined }]),
  }), [])
  const operations = useMutationJournal(journal)
  const contract = useMemo<Contract<RapidInput, RapidReceipt>>(() => ({
    id: 'demo.task.completed.set.v1', intent: 'Set completion state', strategy: { mode: 'optimistic' }, repeatedInput: 'queue-all', retry: 'unsafe',
    resource: () => 'task:123', fingerprint: input => String(input.completed),
    async send(input, { mutationId }) {
      await wait(input.step === 2 ? 1_000 : 500)
      if (input.step === 2) throw new MutationFailure('Reopen was rejected.', 'rejected')
      return { mutationId, completed: input.completed, revision: ++revision.current }
    },
    accepted: (receipt, operation) => receipt.mutationId === operation.id,
    async reconcile(receipt) { setCausalBase(receipt.completed) },
    classify: error => error instanceof MutationFailure ? error.kind : 'unknown',
  }), [])
  const visibleValue = journal.overlays('task:123').at(-1)?.input.completed ?? causalBase

  function run() {
    setStarted(true)
    const sequence: RapidInput[] = [{ completed: true, step: 1 }, { completed: false, step: 2 }, { completed: true, step: 3 }]
    setBaselineLog([{ label: 'Three overlapping requests leave the browser' }])
    setCausalLog([{ label: 'Three intents enter one task:123 causal lane' }])
    for (const input of sequence) {
      setBaselineValue(input.completed)
      const delay = input.step === 1 ? 500 : input.step === 2 ? 2_000 : 900
      void wait(delay).then(() => {
        if (input.step === 2) {
          setBaselineValue(false)
          setBaselineLog(log => [...log, { label: 'Late rejection restores an obsolete snapshot', tone: 'danger' }])
        } else {
          setBaselineValue(input.completed)
          setBaselineLog(log => [...log, { label: `Response ${input.step} writes complete` }])
        }
      })
      journal.submit(contract, input)
    }
  }

  return (
    <div>
      <ScenarioHeader disabled={started} onReset={onReset} onRun={run} runLabel='Run A → B → A' />
      <div className='grid divide-y divide-border border-b border-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
        <Side description='Each click owns a snapshot and requests race independently.' title='Without Causync'><ResultValue label='Task state' value={baselineValue ? 'Complete' : 'Open'} /><Timeline entries={baselineLog} /></Side>
        <Side description='Visible intents apply immediately; transport stays ordered and rejection removes only B.' title='With Causync' withCausync><ResultValue label='Task state' value={visibleValue ? 'Complete' : 'Open'} /><p className='mt-3 text-xs text-muted-foreground'>{operations.length} intents · {operations.filter(item => item.phase === 'confirmed').length} confirmed</p><Timeline entries={causalLog} /></Side>
      </div>
    </div>
  )
}

type ProjectionInput = { today: true }
type ProjectionReceipt = { mutationId: string; eventId: string; projectedVersion: number }

function ProjectionLagDemo({ onReset }: { onReset: () => void }) {
  const [started, setStarted] = useState(false)
  const [baselineToday, setBaselineToday] = useState(false)
  const [baselineLog, setBaselineLog] = useState<TimelineEntry[]>([])
  const [causalBase, setCausalBase] = useState(false)
  const [coveredIds, setCoveredIds] = useState<readonly string[]>([])
  const [causalLog, setCausalLog] = useState<TimelineEntry[]>([])
  const journal = useMemo(() => createMutationJournal<ProjectionInput, ProjectionReceipt>({
    id: () => 'projection-1',
    onTransition: event => setCausalLog(log => [...log, { label: `${event.id} → ${event.phase}`, tone: event.phase === 'confirmed' ? 'positive' : undefined }]),
  }), [])
  const operations = useMutationJournal(journal)
  const contract = useMemo<Contract<ProjectionInput, ProjectionReceipt>>(() => ({
    id: 'demo.todo.today.set.v1', intent: 'Move task to Today', strategy: { mode: 'optimistic' }, repeatedInput: 'single-flight', retry: 'idempotent',
    resource: () => 'task:123', fingerprint: () => 'today:true',
    async send(_input, { mutationId }) { await wait(350); return { mutationId, eventId: 'event-42', projectedVersion: 2 } },
    accepted: (receipt, operation) => receipt.mutationId === operation.id && Boolean(receipt.eventId),
    async reconcile(receipt) { await wait(1_300); if (receipt.projectedVersion < 2) throw new Error('Projection evidence is stale.'); setCausalBase(true) },
    classify: () => 'unknown',
  }), [])
  const visibleToday = journal.overlays('task:123', coveredIds).at(-1)?.input.today ?? causalBase

  async function run() {
    setStarted(true)
    setBaselineToday(true)
    setBaselineLog([{ label: 'Local move: Inbox → Today' }])
    const operation = journal.submit(contract, { today: true })
    await wait(350)
    setBaselineToday(false)
    setBaselineLog(log => [...log, { label: 'Early refetch returns projection v1 → Inbox', tone: 'danger' }])
    await wait(1_300)
    setBaselineToday(true)
    setBaselineLog(log => [...log, { label: 'Later refetch finally returns projection v2' }])
    await operation.settled
    const read = await journal.read(async () => ({ today: true, projectedVersion: 2 }))
    if (read.value.today && read.value.projectedVersion >= 2) {
      setCoveredIds(read.confirmedIds)
      setCausalLog(log => [...log, { label: 'Authoritative read v2 covers projection-1', tone: 'positive' }])
    }
  }

  return (
    <div>
      <ScenarioHeader disabled={started} onReset={onReset} onRun={() => void run()} runLabel='Move task to Today' />
      <div className='grid divide-y divide-border border-b border-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
        <Side description='An eager refetch treats a stale read model as current truth.' title='Without Causync'><ResultValue label='Visible list' value={baselineToday ? 'Today' : 'Inbox'} /><Timeline entries={baselineLog} /></Side>
        <Side description='The overlay survives acceptance and stale reads until versioned coverage is proven.' title='With Causync' withCausync><ResultValue label='Visible list' value={visibleToday ? 'Today' : 'Inbox'} /><p className='mt-3 text-xs text-muted-foreground'>{phaseLabel(operations.at(-1)?.phase)}{coveredIds.length ? ' · Covered' : ''}</p><Timeline entries={causalLog} /></Side>
      </div>
    </div>
  )
}

type RenameInput = { title: string }
type RenameReceipt = { mutationId: string; title: string; revision: number }

function LostResponseDemo({ onReset }: { onReset: () => void }) {
  const [started, setStarted] = useState(false)
  const [draft, setDraft] = useState('Northstar')
  const [baselineTitle, setBaselineTitle] = useState('Atlas')
  const [baselineLog, setBaselineLog] = useState<TimelineEntry[]>([])
  const [causalBase, setCausalBase] = useState('Atlas')
  const [causalLog, setCausalLog] = useState<TimelineEntry[]>([])
  const committed = useRef(new Map<string, RenameReceipt>())
  const journal = useMemo(() => createMutationJournal<RenameInput, RenameReceipt>({
    id: () => 'rename-stable-id',
    onTransition: event => setCausalLog(log => [...log, { label: `${event.id} attempt ${event.attempt} → ${event.phase}`, tone: event.phase === 'uncertain' ? 'warning' : event.phase === 'confirmed' ? 'positive' : undefined }]),
  }), [])
  const operations = useMutationJournal(journal)
  const operation = operations.at(-1)
  const contract = useMemo<Contract<RenameInput, RenameReceipt>>(() => ({
    id: 'demo.project.title.set.v1', intent: 'Rename project', strategy: { mode: 'optimistic' }, repeatedInput: 'single-flight', retry: 'idempotent',
    resource: () => 'project:atlas', fingerprint: input => input.title,
    async send(input, { mutationId }) {
      const existing = committed.current.get(mutationId)
      if (existing) { await wait(300); return existing }
      await wait(700)
      const receipt = { mutationId, title: input.title, revision: 2 }
      committed.current.set(mutationId, receipt)
      throw new MutationFailure('Connection disappeared after commit.', 'unknown')
    },
    accepted: (receipt, current) => receipt.mutationId === current.id,
    async reconcile(receipt) { setCausalBase(receipt.title) },
    classify: error => error instanceof MutationFailure ? error.kind : 'unknown',
  }), [])
  const visibleTitle = journal.overlays('project:atlas').at(-1)?.input.title ?? causalBase

  function run() {
    setStarted(true)
    const oldTitle = baselineTitle
    setBaselineTitle(draft)
    setBaselineLog([{ label: `Optimistic title → ${draft}` }])
    void wait(700).then(() => { setBaselineTitle(oldTitle); setBaselineLog(log => [...log, { label: 'Timeout is treated as failure → rollback', tone: 'danger' }]) })
    journal.submit(contract, { title: draft })
  }

  async function recover() {
    if (!operation) return
    setCausalLog(log => [...log, { label: 'Retry reuses identity and captured payload' }])
    await journal.retry(operation.id)
  }

  return (
    <div>
      <div className='border-b border-border pb-6'>
        <label className='text-sm font-medium' htmlFor='lost-response-title'>New project title</label>
        <div className='mt-2 flex flex-col gap-3 sm:flex-row'>
          <Input disabled={started} id='lost-response-title' onChange={event => setDraft(event.target.value)} value={draft} />
          <Button disabled={started || !draft.trim()} onClick={run} type='button'>Rename on weak network</Button>
          <Button disabled={!started} onClick={onReset} type='button' variant='ghost'><RotateCcw /> Reset</Button>
        </div>
      </div>
      <div className='grid divide-y divide-border border-b border-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
        <Side description='A timeout is assumed to mean rejection, although the mock server committed.' title='Without Causync'><ResultValue label='Project title' value={baselineTitle} /><Timeline entries={baselineLog} /></Side>
        <Side description='Unknown remains distinct from rejection. Intent and identity survive for safe recovery.' title='With Causync' withCausync>
          <ResultValue label='Project title' value={visibleTitle} />
          <div className='mt-3 flex min-h-9 flex-wrap items-center gap-3 text-xs text-muted-foreground'>
            <span>{phaseLabel(operation?.phase)}</span>
            {operation?.phase === 'uncertain' ? <Button onClick={() => void recover()} size='sm' type='button' variant='outline'><AlertTriangle /> Recover same mutation</Button> : null}
            {operation?.phase === 'pending' ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {operation?.phase === 'confirmed' ? <Check className='h-4 w-4 text-primary' /> : null}
          </div>
          <Timeline entries={causalLog} />
        </Side>
      </div>
    </div>
  )
}

function ResultValue({ label, value }: { label: string; value: string }) {
  return <div className='mt-6 border-b border-border pb-5'><p className='text-xs font-medium text-muted-foreground'>{label}</p><p aria-live='polite' className='mt-1 min-h-9 text-2xl font-semibold tracking-tight'>{value}</p></div>
}
