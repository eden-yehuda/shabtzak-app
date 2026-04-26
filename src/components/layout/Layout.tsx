import Head from 'next/head'
import type { ReactNode } from 'react'

export default function Layout({ children, title = 'שבצ"ק' }: { children: ReactNode; title?: string }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
        <header className="bg-navy text-white px-4 py-3 flex justify-between items-center shadow">
          <span className="font-bold text-lg">שבצ"ק מחלקתי</span>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </div>
    </>
  )
}
