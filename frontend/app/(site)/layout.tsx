import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="cx"><SiteNav /><main id="main" tabIndex={-1}>{children}</main><SiteFooter /></div>
}
