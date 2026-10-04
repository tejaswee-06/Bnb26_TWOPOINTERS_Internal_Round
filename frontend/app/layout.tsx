import './globals.css'
import './customer.css'
import './admin.css'
import type { Metadata, Viewport } from 'next'
import { RuntimeHost } from '@/lib/store'
import { INIT_SCRIPT } from '@/lib/prefs'
import A11y from '@/components/A11y'
import Toasts from '@/components/Toasts'
import DemoHUD from '@/components/DemoHUD'
export const metadata: Metadata = { title: { default: 'FAIR DROP — Fair access to high-demand events', template: '%s · FAIR DROP' }, icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2.5s6.5 7 6.5 12a6.5 6.5 0 0 1-13 0c0-5 6.5-12 6.5-12z' fill='%238b7bff'/%3E%3C/svg%3E" }, description: 'Selling 500 seats to 50,000 people without letting bots win. A fair, verifiable allocation platform (hackathon demo, all data simulated).' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning data-theme="dark"><head><script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} /></head>
    <body><a className="skip" href="#main">Skip to content</a><RuntimeHost />{children}<DemoHUD /><A11y up /><Toasts /></body></html>
}
