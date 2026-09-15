import type { Metadata } from 'next'

import { CausyncDemo } from '@/components/causync/CausyncDemo'
import { LoggedOutHeader } from '@/components/headers/LoggedOutHeader'
import { PublicSiteFooter } from '@/components/marketing/PublicSiteFooter'
import { brand } from '@/config/brand'

export const metadata: Metadata = {
  title: `Causync | ${brand.name}`,
  description:
    'A causal mutation runtime for TypeScript and React applications.',
  alternates: { canonical: '/causync' },
  openGraph: {
    title: `Causync | ${brand.name}`,
    description:
      'Make interfaces feel immediate without confusing optimistic state with confirmed truth.',
    url: `${brand.url}/causync`,
  },
}

const story = [
  {
    label: 'The problem',
    title: 'The network is slow. Your interface should not be.',
    description:
      'Most UI waits for an API and hopes responses arrive in order. Rapid clicks, latency and lost connections turn that simple pattern into visible lag and hidden bugs.',
  },
  {
    label: 'The solution',
    title: 'Declare the intent. Causync handles the uncertainty.',
    description:
      'Your app describes one typed mutation contract. Causync owns ordering, repeated input, reconciliation and the path from local intent to confirmed evidence.',
  },
  {
    label: 'The effect',
    title: 'Immediate for people. Predictable for developers and agents.',
    description:
      'Safe changes appear at once while the truth stays honest. The same model can power one product today and future TypeScript applications tomorrow.',
  },
] as const

export default function CausyncPage() {
  return (
    <div className='flex min-h-dvh flex-col bg-background text-foreground'>
      <LoggedOutHeader />
      <main className='flex-1 pt-16'>
        <section className='mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-28 lg:py-36'>
          <p className='text-xs font-semibold tracking-[0.24em] text-primary uppercase'>
            A causal mutation runtime for frontend applications
          </p>
          <h1 className='mt-7 max-w-6xl text-5xl leading-[0.88] font-semibold tracking-[-0.065em] text-balance sm:text-7xl lg:text-[7.5rem]'>
            No app should ever feel <span className='text-primary'>slow.</span>
          </h1>
          <p className='mt-8 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-2xl sm:leading-9'>
            Causync makes the interface respond now, then follows the evidence
            until the application knows what is true.
          </p>
        </section>

        <section className='bg-foreground text-background'>
          <div className='mx-auto max-w-[1400px] px-5 sm:px-8'>
            {story.map((item) => (
              <article
                key={item.label}
                className='grid gap-5 border-b border-background/20 py-12 first:border-t sm:py-16 lg:grid-cols-[0.7fr_2.1fr_1.2fr] lg:gap-12 lg:py-20'
              >
                <p className='text-xs font-semibold tracking-[0.22em] text-background/60 uppercase'>
                  {item.label}
                </p>
                <h2 className='max-w-3xl text-3xl leading-[1.02] font-semibold tracking-[-0.045em] sm:text-5xl'>
                  {item.title}
                </h2>
                <p className='max-w-xl text-base leading-7 text-background/70 lg:pt-1'>
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className='mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-28'>
          <div className='grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-end'>
            <div>
              <p className='text-xs font-semibold tracking-[0.2em] text-primary uppercase'>
                Try it
              </p>
              <h2 className='mt-4 text-4xl leading-[0.98] font-semibold tracking-[-0.045em] sm:text-6xl'>
                Break the network. Keep the intent.
              </h2>
            </div>
            <p className='max-w-xl text-base leading-7 text-muted-foreground lg:justify-self-end'>
              Run the same interaction through ordinary promise state and the
              real Causync journal. Then introduce rapid intent, projection lag
              and a response lost after commit.
            </p>
          </div>
          <CausyncDemo />
          <p className='mt-4 text-xs text-muted-foreground'>
            Deterministic fault lab · mocked authority · nothing is persisted
          </p>
        </section>

        <section className='border-t border-border'>
          <div className='mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-28'>
            <p className='text-xs font-semibold tracking-[0.2em] text-primary uppercase'>
              Built for what comes next
            </p>
            <h2 className='mt-5 max-w-5xl text-4xl leading-[0.98] font-semibold tracking-[-0.05em] sm:text-6xl lg:text-7xl'>
              AI should declare what the user wants. The engine should handle
              what can go wrong.
            </h2>
            <div className='mt-16 grid gap-10 border-t border-border pt-10 md:grid-cols-3 md:gap-12'>
              <div>
                <h3 className='text-sm font-semibold'>Available now</h3>
                <p className='mt-3 text-sm leading-7 text-muted-foreground'>
                  Typed intents, causal ordering, runtime schemas, recovery,
                  framework adapters and conformance tests give generated
                  features one enforceable foundation.
                </p>
              </div>
              <div>
                <h3 className='text-sm font-semibold'>
                  Next in the open-source path
                </h3>
                <p className='mt-3 text-sm leading-7 text-muted-foreground'>
                  A transport-neutral protocol specification, agent setup,
                  deeper static analysis and certified adapters for existing
                  REST, GraphQL, CQRS and transactional systems.
                </p>
              </div>
              <div>
                <h3 className='text-sm font-semibold'>The ambition</h3>
                <p className='mt-3 text-sm leading-7 text-muted-foreground'>
                  Make reliable, immediate interaction reusable enough that a
                  slow-feeling application becomes the exception, whether its
                  code is written by a person or an agent.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicSiteFooter />
    </div>
  )
}
