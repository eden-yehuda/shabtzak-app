import Head from 'next/head'
import Link from 'next/link'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
  navActions?: ReactNode
}

export default function Layout({ children, title = 'שבצק צוות אוראל', navActions }: Props) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900" dir="rtl">
        <header className="bg-navy text-white px-4 py-3 flex justify-between items-center gap-2 flex-wrap">
          <span className="font-bold text-lg">{'שבצ"ק צוות אוראל'}</span>
          <div className="flex items-center gap-3 flex-wrap">
            {navActions}
            <Link href="/admin/login" className="text-xs opacity-60 hover:opacity-100 transition">
              כניסת אחראי
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </div>
    </>
  )
}
