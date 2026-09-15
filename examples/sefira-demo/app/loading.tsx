import { LoggedOutHeader } from '@/components/headers/LoggedOutHeader'
import { PublicSiteFooter } from '@/components/marketing/PublicSiteFooter'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className='flex min-h-dvh flex-col bg-background'>
      <LoggedOutHeader />
      <main className='flex-1 pt-16'>
        <div className='mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-28'>
          <Skeleton className='h-3 w-44' />
          <Skeleton className='mt-6 h-16 w-full max-w-4xl sm:h-24' />
          <Skeleton className='mt-3 h-16 w-full max-w-3xl sm:h-24' />
          <Skeleton className='mt-7 h-20 w-full max-w-2xl' />
          <div className='mt-16 grid gap-5 border-y border-border py-12 lg:grid-cols-2'>
            <Skeleton className='h-[24rem]' />
            <Skeleton className='h-[24rem]' />
          </div>
        </div>
      </main>
      <PublicSiteFooter />
    </div>
  )
}
